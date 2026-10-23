import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import bcrypt from 'bcryptjs';
import { endSessions, isValidEmail, normaliseEmail } from '$lib/server/account';
import { sendEmailChangedNotice, sendPasswordChangedNotice } from '$lib/server/account-emails';
import { rateLimit, rateLimitKey, rateLimitStatus, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { deleteSession } from '$lib/auth';
import { syncLinkedRows } from '$lib/server/identity';
import { markEmailChanged, sendVerificationEmail } from '$lib/server/email-verification';
import { deleteAccount, planAccountDeletion } from '$lib/server/account-deletion';
import { liveDeletionDeps } from '$lib/server/account-deletion-live';

/** Check the account's current password, counting only wrong guesses against the
 *  same per-account limit sign-in uses: a stolen session must not become a free
 *  password oracle. Returns an error message, or null when the password is right. */
async function checkCurrentPassword(locals: App.Locals, userId: string, email: string, password: string): Promise<string | null> {
	const errors = st(locals.locale).serverErrors;
	const key = rateLimitKey('login_email', email);
	const status = await rateLimitStatus(locals.db, key, RATE_LIMITS.loginEmail);
	if (!status.ok) return tooManyAttemptsMessage(errors.tooManyAttempts, status.retryAfterMinutes);

	const user = await dbFirst<{ password_hash: string }>(locals.db, 'SELECT password_hash FROM users WHERE id = ?', userId);
	if (user && (await bcrypt.compare(password, user.password_hash))) return null;
	await rateLimit(locals.db, key, RATE_LIMITS.loginEmail);
	return errors.currentPasswordIncorrect;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));

	const user = await dbFirst<Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'role' | 'created_at' | 'email_verified_at' | 'org_id'>>(
		locals.db,
		'SELECT id, email, first_name, last_name, role, created_at, email_verified_at, org_id FROM users WHERE id = ?',
		locals.user.id
	);
	if (!user) redirect(303, loginUrl(url));

	// What deleting the account would do (D7), shown before anyone confirms.
	const deletion = await planAccountDeletion(locals.db, user.id);
	return { profile: user, emailVerified: !!user.email_verified_at, deletion };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals, url }) => {
		if (!locals.user) return fail(401);
		const errors = st(locals.locale).serverErrors;

		const data = await request.formData();
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();
		const email = normaliseEmail(data.get('email'));

		if (!firstName || !lastName || !email) {
			return fail(400, { error: errors.allFieldsRequired, section: 'profile' });
		}
		// type="email" is the browser's courtesy; a posted form need not carry it.
		if (!isValidEmail(email)) {
			return fail(400, { error: errors.enterValidEmail, section: 'profile' });
		}

		const current = await dbFirst<{ email: string; org_id: string | null }>(
			locals.db,
			'SELECT email, org_id FROM users WHERE id = ?',
			locals.user.id
		);
		if (!current) return fail(401);
		const emailChanged = email !== current.email;

		if (emailChanged) {
			// The email is the login: changing it takes the password, the same as
			// changing the password does, so an unattended session cannot take the
			// account over by pointing it, and its password resets, at a new address.
			const password = String(data.get('currentPassword') ?? '');
			if (!password) {
				return fail(400, { error: st(locals.locale).profile.emailChangeNeedsPassword, section: 'profile', needsPassword: true });
			}
			const wrong = await checkCurrentPassword(locals, locals.user.id, current.email, password);
			if (wrong) return fail(400, { error: wrong, section: 'profile', needsPassword: true });

			// Unique among the accounts this one competes with: Hallify accounts (no org)
			// share one namespace, and each venue's clients have their own. Checking every
			// user told anyone that some venue had a client with that address.
			const existing = await dbFirst<{ id: string }>(
				locals.db,
				'SELECT id FROM users WHERE email = ? AND org_id IS ? AND id != ?',
				email,
				current.org_id,
				locals.user.id
			);
			if (existing) {
				return fail(400, { error: errors.emailAlreadyInUse, section: 'profile', needsPassword: true });
			}
		}

		if (emailChanged) {
			// A new address is unverified until its own link is opened (D11); the venue
			// rows linked to the account follow it (D4).
			await markEmailChanged(locals.db, locals.user.id, { email, firstName, lastName });
			await sendEmailChangedNotice(locals.db, locals.locale, current.email, email);
			await sendVerificationEmail(locals.db, { userId: locals.user.id, email, origin: url.origin, locale: locals.locale });
		} else {
			await dbRun(
				locals.db,
				'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
				firstName,
				lastName,
				locals.user.id
			);
			// The venues see the same name as hallify.sk does.
			if (current.org_id === null) await syncLinkedRows(locals.db, locals.user.id, { firstName, lastName });
		}

		return { success: true, section: 'profile', emailChanged };
	},

	changePassword: async ({ request, locals, cookies }) => {
		if (!locals.user) return fail(401);

		const data = await request.formData();
		const current = String(data.get('currentPassword') ?? '');
		const newPass = String(data.get('newPassword') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

		if (!current || !newPass) {
			return fail(400, { error: st(locals.locale).serverErrors.allFieldsRequired, section: 'password' });
		}
		if (newPass.length < 6) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordTooShort, section: 'password' });
		}
		if (newPass !== confirm) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordsDoNotMatch, section: 'password' });
		}

		const wrong = await checkCurrentPassword(locals, locals.user.id, locals.user.email, current);
		if (wrong) return fail(400, { error: wrong, section: 'password' });

		const hash = await bcrypt.hash(newPass, 10);
		await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, locals.user.id);
		// This device stays signed in; every other one has to use the new password.
		await endSessions(locals.db, locals.user.id, cookies.get('session_id'));
		// If it was not them, this is how the owner of the account finds out.
		sendPasswordChangedNotice(locals.db, locals.locale, locals.user.email).catch(() => {});

		return { success: true, section: 'password' };
	},

	/** Self-service deletion (D7): the password and an explicit confirmation. */
	deleteAccount: async ({ request, locals, cookies, url }) => {
		if (!locals.user) return fail(401);
		const T = st(locals.locale);
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (data.get('confirm') !== 'on') return fail(400, { error: T.identity.deleteMustConfirm, section: 'delete' });
		if (!password) return fail(400, { error: T.serverErrors.allFieldsRequired, section: 'delete' });
		const wrong = await checkCurrentPassword(locals, locals.user.id, locals.user.email, password);
		if (wrong) return fail(400, { error: wrong, section: 'delete' });

		const result = await deleteAccount(
			locals.db,
			locals.user.id,
			liveDeletionDeps(locals.db, { origin: url.origin, closedBy: { id: locals.user.id, email: locals.user.email } })
		);
		if (!result.ok) {
			if (result.reason === 'lastPlatformAdmin') return fail(400, { error: T.identity.deleteLastAdmin, section: 'delete' });
			if (result.reason === 'billing') return fail(502, { error: T.identity.deleteBillingFailed(result.org), section: 'delete' });
			return fail(404, { error: T.serverErrors.userNotFound, section: 'delete' });
		}
		await deleteSession(cookies, locals.db);
		redirect(303, '/app/login?deleted=1');
	},
};
