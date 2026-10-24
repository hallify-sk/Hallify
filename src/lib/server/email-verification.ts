// Email verification (D11). See DESIGN-identity.md.
//
// Links are stored like password resets: only the SHA-256 of the mailed token. A link
// verifies only while the account still has the address it was sent to.
//
// Opening a link proves the mailbox, not that the mailbox's owner chose the account's
// password: anyone can sign up with someone else's address, and the owner may click
// "confirm" in good faith. So opening one only verifies. The address's old venue
// accounts are joined to the Hallify account only when the same link is confirmed with
// the account's password (`joinOldAccounts`), or by a finished password reset.

import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { dbFirst, dbRun } from '$lib/db/index';
import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { escapeHtml, renderLayout } from '$lib/server/email-layout';
import { emailCopy } from '$lib/server/email-copy';
import { hashToken } from '$lib/server/account';
import bcrypt from 'bcryptjs';
import { claimClientRows, joinableVenues, passwordOpens, syncLinkedRows, type HallifyAccount } from '$lib/server/identity';
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
	| { status: 'verified'; userId: string; email: string }
	| { status: 'invalid' | 'expired' | 'stale' };

/**
 * Redeem a link. A link already used for the address the account still has is
 * answered as verified again (people click twice). It only verifies: old venue
 * accounts are joined by `joinOldAccounts`, which also needs the account's password.
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
		return user.email_verified_at ? { status: 'verified', userId: user.id, email: user.email } : { status: 'invalid' };
	}
	const expires = Date.parse(row.expires_at);
	if (!Number.isFinite(expires) || expires <= now) return { status: 'expired' };

	const spent = await dbRun(db, 'UPDATE email_verifications SET used_at = ? WHERE id = ? AND used_at IS NULL', new Date(now).toISOString(), row.id);
	if ((spent.meta?.changes ?? 0) > 0 && !user.email_verified_at) await markVerified(db, user.id, new Date(now).toISOString());
	return { status: 'verified', userId: user.id, email: user.email };
}

export type JoinLink =
	| { status: 'ok'; account: HallifyAccount; venues: string[] }
	| { status: 'invalid' | 'expired' | 'stale' };

/**
 * The Hallify account a verification link can join old venue accounts to, and the
 * venues those are at. The link must still be within its time (used or not: opening
 * it already spent it on verifying) and the account must still have its address.
 */
export async function findJoinLink(db: D1Database, token: string, now = Date.now()): Promise<JoinLink> {
	if (!token || token.length > 128) return { status: 'invalid' };
	const row = await dbFirst<{ user_id: string; email: string; expires_at: string }>(
		db,
		'SELECT user_id, email, expires_at FROM email_verifications WHERE token = ?',
		await hashToken(token)
	);
	if (!row) return { status: 'invalid' };
	const account = await dbFirst<HallifyAccount>(
		db,
		`SELECT id, email, password_hash, first_name, last_name, email_verified_at, locale, is_platform_admin
		   FROM users WHERE id = ? AND org_id IS NULL AND deleted_at IS NULL`,
		row.user_id
	);
	if (!account) return { status: 'invalid' };
	if (account.email.toLowerCase() !== row.email.toLowerCase()) return { status: 'stale' };
	const expires = Date.parse(row.expires_at);
	if (!Number.isFinite(expires) || expires <= now) return { status: 'expired' };
	return { status: 'ok', account, venues: await joinableVenues(db, account) };
}

/**
 * Join the address's old venue accounts to the Hallify account a live link names, once
 * the person opening it shows they also hold the account: signed in as it, or with
 * its password. Whoever only reads the mailbox cannot (the account may be someone
 * else's, made with their address), and whoever only knows the password has no link.
 */
export async function joinOldAccounts(
	db: D1Database,
	account: HallifyAccount,
	proof: { signedInAs?: string | null; password?: string },
	compare: (password: string, hash: string) => Promise<boolean> = bcrypt.compare
): Promise<{ ok: true; joined: number } | { ok: false }> {
	const holder = proof.signedInAs === account.id
		|| (!!proof.password && (await passwordOpens(compare, proof.password, account.password_hash)));
	if (!holder) return { ok: false };
	const at = account.email_verified_at ?? new Date().toISOString();
	if (!account.email_verified_at) await markVerified(db, account.id, at);
	return { ok: true, joined: await claimClientRows(db, { ...account, email_verified_at: at }) };
}

/**
 * A password reset mailed to the account's current address was finished: whoever
 * opened the link reads the mailbox and has just set the password, so nobody else
 * holds the account any more. The address counts as verified, and for a Hallify
 * account every old, unlinked venue account with that address is joined to it.
 * Returns how many were joined. Not for verification links (see `joinOldAccounts`).
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

/** The venues whose old accounts a finished reset of `userId` would join (see
 *  `mailboxProven`), so the reset page can say so before the password is set. */
export async function venuesJoinedByReset(db: D1Database, userId: string): Promise<string[]> {
	const account = await dbFirst<{ email: string }>(
		db,
		'SELECT email FROM users WHERE id = ? AND org_id IS NULL AND deleted_at IS NULL',
		userId
	);
	return account ? joinableVenues(db, account) : [];
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

/** What a mailed link is for: confirming the address, or (from a venue's "send me a
 *  link") joining the address's older venue account to the Hallify account. Both are
 *  the same kind of link; the join email says plainly what opening it can do. */
export type VerificationPurpose = 'verify' | 'join';

/** The verification email, separate from sending so it can be tested. */
export function verificationEmail(
	locale: Locale | null | undefined,
	email: string,
	url: string,
	venue?: string | null,
	purpose: VerificationPurpose = 'verify'
): { subject: string; html: string } {
	const c = st(locale).identity;
	const join = purpose === 'join';
	const body = (join ? c.joinBody : venue ? c.verifyBodyVenue : c.verifyBody)
		.split('{email}').join('\u0000email\u0000')
		.split('{venue}').join('\u0000venue\u0000');
	const bodyHtml = `<p>${escapeHtml(body)
		.split('\u0000email\u0000').join(`<strong>${escapeHtml(email)}</strong>`)
		.split('\u0000venue\u0000').join(`<strong>${escapeHtml(venue ?? '')}</strong>`)}</p>`;
	const title = join ? c.joinSubject : c.verifySubject;
	const subject = venue ? `${title} – ${venue}` : `Hallify – ${title}`;
	const html = renderLayout({
		locale: locale === 'en' ? 'en' : 'sk',
		brand: venue || 'Hallify',
		subject,
		bodyHtml,
		cta: { label: join ? c.joinCta : c.verifyCta, url },
		linkFallback: emailCopy(locale).footer.linkFallback,
		footer: [join ? c.joinIgnore : c.verifyIgnore]
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
	opts: { userId: string; email: string; origin: string; locale?: Locale | null; venue?: string | null; purpose?: VerificationPurpose }
): Promise<boolean> {
	const token = await createEmailVerification(db, opts.userId, opts.email);
	const url = `${opts.origin.replace(/\/$/, '')}/verify-email/${token}`;
	if (dev || !env.BREVO_API_KEY) console.info(`[verify-email] link for ${opts.email}: ${url}`);
	const { subject, html } = verificationEmail(opts.locale, opts.email, url, opts.venue, opts.purpose);
	try {
		return await sendEmail(db, opts.email, subject, html, 'emailVerification', opts.venue ? { fromName: opts.venue } : {});
	} catch {
		return false;
	}
}
