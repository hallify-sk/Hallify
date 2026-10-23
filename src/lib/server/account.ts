// Account security shared by the apex and the venue sites: email format, password-reset
// tokens and ending sessions.
//
// Reset tokens used to be stored as they were mailed, and redeeming one only marked that
// one row used: every other link the person had requested stayed valid, and every
// session already signed in (possibly the attacker's, which is usually why someone
// resets) carried on. Now a token is stored only as its SHA-256, and a completed reset
// spends every outstanding link for the account and signs out all of its sessions.

import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

/** How long a mailed reset link stays usable. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Deliberately loose: one @, something on both sides, a dot in the domain, no spaces.
 *  The real check is whether mail arrives; this only stops obvious typos and junk. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s.]+$/;

export function normaliseEmail(raw: unknown): string {
	return String(raw ?? '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
	return email.length <= 254 && EMAIL_RE.test(email);
}

/** Hex SHA-256 of a token: what is stored and looked up, never the token itself. */
export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 32 random bytes as 64 hex characters. */
function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store a new reset for `userId` and return the token to mail. Only its hash is kept. */
export async function createPasswordReset(db: D1Database, userId: string, now = Date.now()): Promise<string> {
	const token = randomToken();
	await dbRun(
		db,
		'INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
		crypto.randomUUID(),
		userId,
		await hashToken(token),
		new Date(now + RESET_TTL_MS).toISOString()
	);
	return token;
}

export interface PasswordReset {
	id: string;
	user_id: string;
}

/** Which accounts a reset page may serve: the apex serves Hallify accounts (no org);
 *  `client` only one venue's own clients; `venue` (a venue site since D4) its own
 *  clients and Hallify accounts, whose password signs people in on every venue site.
 *  A client token mailed by one venue is never redeemable on another's site. */
export type ResetScope = { kind: 'apex' } | { kind: 'client'; orgId: string } | { kind: 'venue'; orgId: string };

/**
 * The reset row a token names within `scope`, used or not, or null.
 *
 * Rows written before tokens were hashed hold the 32-character token itself. They are
 * still matched for the hour they live, but only by length: a stored hash is 64
 * characters, so knowing a hash (say, from a database copy) never redeems it.
 */
export async function findPasswordResetRow(
	db: D1Database,
	token: string,
	scope: ResetScope
): Promise<(PasswordReset & { expires_at: string; used: number }) | null> {
	if (!token || token.length > 128) return null;
	const scopeSql =
		scope.kind === 'apex' ? 'u.org_id IS NULL'
		: scope.kind === 'client' ? "u.org_id = ? AND u.account_type = 'client'"
		: "((u.org_id = ? AND u.account_type = 'client') OR u.org_id IS NULL)";
	return dbFirst<PasswordReset & { expires_at: string; used: number }>(
		db,
		`SELECT pr.id, pr.user_id, pr.expires_at, pr.used
		   FROM password_resets pr
		   JOIN users u ON u.id = pr.user_id
		  WHERE (pr.token = ? OR (pr.token = ? AND length(pr.token) = 32))
		    AND ${scopeSql}
		  LIMIT 1`,
		await hashToken(token),
		token,
		...(scope.kind === 'apex' ? [] : [scope.orgId])
	);
}

/** The live reset a token names: null when it is unknown, used, expired or belongs to
 *  an account outside `scope`. */
export async function findPasswordReset(
	db: D1Database,
	token: string,
	scope: ResetScope,
	now = Date.now()
): Promise<PasswordReset | null> {
	const row = await findPasswordResetRow(db, token, scope);
	if (!row || row.used) return null;
	const expires = Date.parse(row.expires_at);
	if (!Number.isFinite(expires) || expires <= now) return null;
	return { id: row.id, user_id: row.user_id };
}

/**
 * Set the new password and close every door the old one opened.
 *
 * The link is claimed first with a conditional update, so two submissions of the same
 * link cannot both succeed. Returns false when it had already been used.
 */
export async function completePasswordReset(db: D1Database, reset: PasswordReset, passwordHash: string): Promise<boolean> {
	const claimed = await dbRun(db, 'UPDATE password_resets SET used = 1 WHERE id = ? AND used = 0', reset.id);
	if ((claimed.meta?.changes ?? 0) === 0) return false;

	await dbRun(db, 'UPDATE users SET password_hash = ? WHERE id = ?', passwordHash, reset.user_id);
	// Any other link they asked for is now pointless, and possibly not theirs.
	await dbRun(db, 'UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0', reset.user_id);
	await endSessions(db, reset.user_id);
	return true;
}

/** Sign an account out everywhere, or everywhere but `keepSessionId` (the device that
 *  just changed the password stays signed in). "Everywhere" includes the venue sites:
 *  the client rows linked to a Hallify account are opened by its password (D4). */
export async function endSessions(db: D1Database, userId: string, keepSessionId?: string): Promise<void> {
	const whose = '(user_id = ? OR user_id IN (SELECT id FROM users WHERE account_id = ?))';
	if (keepSessionId) {
		await dbRun(db, `DELETE FROM sessions WHERE ${whose} AND id != ?`, userId, userId, keepSessionId);
	} else {
		await dbRun(db, `DELETE FROM sessions WHERE ${whose}`, userId, userId);
	}
}
