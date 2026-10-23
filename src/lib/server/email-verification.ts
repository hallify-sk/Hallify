// Email verification (D11). See DESIGN-identity.md.
//
// Links are stored like password resets: only the SHA-256 of the mailed token. A link
// verifies only while the account still has the address it was sent to. Opening one
// for a Hallify account also claims that address's old, unlinked venue accounts.

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { dbFirst, dbRun } from '$lib/db/index';
import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { escapeHtml, renderLayout } from '$lib/server/email-layout';
import { emailCopy } from '$lib/server/email-copy';
import { hashToken } from '$lib/server/account';
import { claimClientRows, syncLinkedRows, type HallifyAccount } from '$lib/server/identity';
import type { Locale } from '$lib/i18n';
import type { D1Database } from '@cloudflare/workers-types';

/** How long a mailed verification link works. */
export const VERIFY_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** `REQUIRE_EMAIL_VERIFICATION` as a switch: on only for an explicit yes. */
export function isOn(value: string | null | undefined): boolean {
	return ['1', 'true', 'on', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

/** Whether unverified operators are kept out of the console. Off unless set, because
 *  without working email nobody could get in. */
export function verificationRequired(): boolean {
	return isOn(env.REQUIRE_EMAIL_VERIFICATION);
}

/** The console pages an unverified operator is kept out of while the switch is on. */
export function isGatedPath(pathname: string): boolean {
	return ['/app/manage', '/app/org/new', '/app/welcome', '/app/billing'].some(
		(p) => pathname === p || pathname.startsWith(`${p}/`)
	);
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a new link for `userId` at `email` and return the token to mail. */
export async function createEmailVerification(db: D1Database, userId: string, email: string, now = Date.now()): Promise<string> {
	const token = randomToken();
	await dbRun(
		db,
		'INSERT INTO email_verifications (id, user_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)',
		crypto.randomUUID(),
		userId,
		email,
		await hashToken(token),
		new Date(now + VERIFY_TTL_MS).toISOString()
	);
	return token;
}

/** Mark an account's current address verified, with its linked client rows. */
export async function markVerified(db: D1Database, userId: string, at = new Date().toISOString()): Promise<void> {
	await dbRun(db, 'UPDATE users SET email_verified_at = ? WHERE id = ?', at, userId);
	await dbRun(db, 'UPDATE users SET email_verified_at = ? WHERE account_id = ?', at, userId);
}

export type VerifyResult =
	| { status: 'verified'; userId: string; email: string; claimed: number }
	| { status: 'invalid' | 'expired' | 'stale' };

/**
 * Redeem a link. A link already used for the address the account still has is
 * answered as verified again (people click twice). Opening a link for a Hallify
 * account claims every unlinked venue account with that address.
 */
export async function verifyEmailToken(db: D1Database, token: string, now = Date.now()): Promise<VerifyResult> {
	if (!token || token.length > 128) return { status: 'invalid' };
	const row = await dbFirst<{ id: string; user_id: string; email: string; expires_at: string; used_at: string | null }>(
		db,
		'SELECT id, user_id, email, expires_at, used_at FROM email_verifications WHERE token = ?',
		await hashToken(token)
	);
	if (!row) return { status: 'invalid' };
	const user = await dbFirst<HallifyAccount & { org_id: string | null }>(
		db,
		`SELECT id, email, password_hash, first_name, last_name, email_verified_at, locale, is_platform_admin, org_id
		   FROM users WHERE id = ? AND deleted_at IS NULL`,
		row.user_id
	);
	if (!user) return { status: 'invalid' };
	if (user.email.toLowerCase() !== row.email.toLowerCase()) return { status: 'stale' };
	if (row.used_at) {
		return user.email_verified_at ? { status: 'verified', userId: user.id, email: user.email, claimed: 0 } : { status: 'invalid' };
	}
	const expires = Date.parse(row.expires_at);
	if (!Number.isFinite(expires) || expires <= now) return { status: 'expired' };

	const claimed = await dbRun(db, 'UPDATE email_verifications SET used_at = ? WHERE id = ? AND used_at IS NULL', new Date(now).toISOString(), row.id);
	if ((claimed.meta?.changes ?? 0) === 0) return { status: 'verified', userId: user.id, email: user.email, claimed: 0 };

	const joined = await mailboxProven(db, user.id, now);
	return { status: 'verified', userId: user.id, email: user.email, claimed: joined };
}

/**
 * A link mailed to the account's current address was opened (a verification link,
 * or a password reset): the address is the person's. It counts as verified, and for a
 * Hallify account every old, unlinked venue account with that address is joined to it.
 * Returns how many were joined.
 */
export async function mailboxProven(db: D1Database, userId: string, now = Date.now()): Promise<number> {
	const user = await dbFirst<HallifyAccount & { org_id: string | null }>(
		db,
		`SELECT id, email, password_hash, first_name, last_name, email_verified_at, locale, is_platform_admin, org_id
		   FROM users WHERE id = ? AND deleted_at IS NULL`,
		userId
	);
	if (!user) return 0;
	const at = user.email_verified_at ?? new Date(now).toISOString();
	if (!user.email_verified_at) await markVerified(db, user.id, at);
	return user.org_id === null ? claimClientRows(db, { ...user, email_verified_at: at }) : 0;
}

/** A changed address is unverified until its own link is opened. */
export async function markEmailChanged(
	db: D1Database,
	accountId: string,
	fields: { email: string; firstName: string; lastName: string }
): Promise<void> {
	await dbRun(db, 'UPDATE users SET email = ?, first_name = ?, last_name = ?, email_verified_at = NULL WHERE id = ?',
		fields.email, fields.firstName, fields.lastName, accountId);
	await syncLinkedRows(db, accountId, { ...fields, emailVerifiedAt: null });
	// Links mailed to the old address must not verify the new one, nor reset its password.
	await dbRun(db, 'UPDATE email_verifications SET used_at = datetime(\'now\') WHERE user_id = ? AND used_at IS NULL', accountId);
	await dbRun(db, 'UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', accountId);
}

/** The verification email, separate from sending so it can be tested. */
export function verificationEmail(
	locale: Locale | null | undefined,
	email: string,
	url: string,
	venue?: string | null
): { subject: string; html: string } {
	const c = st(locale).identity;
	const body = (venue ? c.verifyBodyVenue : c.verifyBody)
		.split('{email}').join('\u0000email\u0000')
		.split('{venue}').join('\u0000venue\u0000');
	const bodyHtml = `<p>${escapeHtml(body)
		.split('\u0000email\u0000').join(`<strong>${escapeHtml(email)}</strong>`)
		.split('\u0000venue\u0000').join(`<strong>${escapeHtml(venue ?? '')}</strong>`)}</p>`;
	const subject = venue ? `${c.verifySubject} – ${venue}` : `Hallify – ${c.verifySubject}`;
	const html = renderLayout({
		locale: locale === 'en' ? 'en' : 'sk',
		brand: venue || 'Hallify',
		subject,
		bodyHtml,
		cta: { label: c.verifyCta, url },
		linkFallback: emailCopy(locale).footer.linkFallback,
		footer: [c.verifyIgnore]
	});
	return { subject, html };
}

/**
 * Create a link for `userId` and mail it to `email`. The link points at `origin`
 * (the venue's own site when sent from there). Without an email provider (local
 * development) the link is written to the log so it can still be opened.
 */
export async function sendVerificationEmail(
	db: D1Database,
	opts: { userId: string; email: string; origin: string; locale?: Locale | null; venue?: string | null }
): Promise<boolean> {
	const token = await createEmailVerification(db, opts.userId, opts.email);
	const url = `${opts.origin.replace(/\/$/, '')}/verify-email/${token}`;
	if (dev || !env.BREVO_API_KEY) console.info(`[verify-email] link for ${opts.email}: ${url}`);
	const { subject, html } = verificationEmail(opts.locale, opts.email, url, opts.venue);
	try {
		return await sendEmail(db, opts.email, subject, html, 'emailVerification', opts.venue ? { fromName: opts.venue } : {});
	} catch {
		return false;
	}
}
