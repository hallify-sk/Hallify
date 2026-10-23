// One Hallify account on every venue site (D4). See DESIGN-identity.md.
//
// A venue's clients are still per-venue `users` rows (account_type 'client', org_id =
// the venue): they scope bookings, messages and the venue's client list. What changed
// is who signs them in. A client row LINKED to a Hallify account (users.account_id) has
// no password of its own; the Hallify account's email and password open it, and one is
// created on the first sign-in at a new venue.

import bcrypt from 'bcryptjs';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

/** The password_hash of a linked client row: never a bcrypt hash, so nothing matches it. */
export const LINKED_PASSWORD = '!linked';

export interface HallifyAccount {
	id: string;
	email: string;
	password_hash: string;
	first_name: string;
	last_name: string;
	email_verified_at: string | null;
	locale: string | null;
	is_platform_admin: number;
}

export interface ClientRow {
	id: string;
	email: string;
	password_hash: string;
	account_id: string | null;
	email_verified_at: string | null;
}

type Compare = (password: string, hash: string) => Promise<boolean>;

/** bcrypt, but a linked or anonymised row never matches and never reaches bcrypt. */
async function passwordOpens(compare: Compare, password: string, hash: string | null | undefined): Promise<boolean> {
	if (!hash || hash.startsWith('!')) return false;
	try {
		return await compare(password, hash);
	} catch {
		return false;
	}
}

/** The Hallify account (no organisation) with this email, if any. */
export function findHallifyAccount(db: D1Database, email: string): Promise<HallifyAccount | null> {
	return dbFirst<HallifyAccount>(
		db,
		`SELECT id, email, password_hash, first_name, last_name, email_verified_at, locale, is_platform_admin
		   FROM users WHERE email = ? AND org_id IS NULL AND deleted_at IS NULL`,
		email
	);
}

/** The client row this venue has for this email, if any. */
export function findClientRow(db: D1Database, orgId: string, email: string): Promise<ClientRow | null> {
	return dbFirst<ClientRow>(
		db,
		`SELECT id, email, password_hash, account_id, email_verified_at
		   FROM users WHERE org_id = ? AND email = ? AND account_type = 'client' AND deleted_at IS NULL`,
		orgId,
		email
	);
}

async function isMember(db: D1Database, orgId: string, userId: string): Promise<boolean> {
	const row = await dbFirst<{ ok: number }>(
		db,
		'SELECT 1 AS ok FROM organization_members WHERE org_id = ? AND user_id = ? LIMIT 1',
		orgId,
		userId
	);
	return !!row;
}

/** Link an existing client row to a Hallify account: from now on the account's
 *  password opens it, and it carries the account's name, language and verification. */
export async function linkClientRow(db: D1Database, clientId: string, account: HallifyAccount): Promise<void> {
	await dbRun(
		db,
		`UPDATE users SET account_id = ?, password_hash = ?, first_name = ?, last_name = ?,
		        email_verified_at = ?, locale = COALESCE(?, locale)
		  WHERE id = ? AND account_type = 'client' AND (account_id IS NULL OR account_id = ?)`,
		account.id,
		LINKED_PASSWORD,
		account.first_name,
		account.last_name,
		account.email_verified_at,
		account.locale,
		clientId,
		account.id
	);
}

/** Create this venue's client row for a Hallify account, already linked. If a
 *  concurrent request created it first, that row is returned instead. */
export async function createLinkedClient(db: D1Database, orgId: string, account: HallifyAccount): Promise<string> {
	const id = crypto.randomUUID();
	try {
		await dbRun(
			db,
			`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id, email_verified_at, locale)
			 VALUES (?, ?, ?, ?, ?, 'client', ?, ?, ?, ?)`,
			id,
			account.email,
			LINKED_PASSWORD,
			account.first_name,
			account.last_name,
			orgId,
			account.id,
			account.email_verified_at,
			account.locale
		);
		return id;
	} catch (err) {
		// Lost a race against users_email_org_unique: use the row that won if it is ours.
		const existing = await findClientRow(db, orgId, account.email);
		if (existing?.account_id === account.id) return existing.id;
		throw err;
	}
}

/**
 * Link every unlinked client row with the account's email, at every venue, to the
 * account. Called only once the account has just proven the address (a verification
 * link was opened), which is what makes the old rows theirs. Returns how many.
 */
export async function claimClientRows(db: D1Database, account: HallifyAccount): Promise<number> {
	const rows = await dbAll<{ id: string }>(
		db,
		`SELECT id FROM users
		  WHERE email = ? AND account_type = 'client' AND org_id IS NOT NULL
		    AND account_id IS NULL AND deleted_at IS NULL`,
		account.email
	);
	for (const r of rows) {
		await linkClientRow(db, r.id, account);
		// The old venue password no longer opens the row, so neither may anything it
		// issued: whoever was signed in with it signs in again with the Hallify account.
		await dbRun(db, 'DELETE FROM sessions WHERE user_id = ?', r.id);
		await dbRun(db, 'DELETE FROM password_resets WHERE user_id = ?', r.id);
	}
	return rows.length;
}

/** Copy name (and, when given, email and verification) from a Hallify account onto
 *  its linked client rows. An email that another client row at the same venue already
 *  uses is left alone for that venue rather than failing the whole change. */
export async function syncLinkedRows(
	db: D1Database,
	accountId: string,
	fields: { firstName: string; lastName: string; email?: string; emailVerifiedAt?: string | null }
): Promise<void> {
	await dbRun(db, 'UPDATE users SET first_name = ?, last_name = ? WHERE account_id = ?', fields.firstName, fields.lastName, accountId);
	if (fields.email !== undefined) {
		await dbRun(
			db,
			`UPDATE users SET email = ?
			  WHERE account_id = ?
			    AND NOT EXISTS (SELECT 1 FROM users other
			                     WHERE other.org_id = users.org_id AND other.email = ? AND other.id != users.id)`,
			fields.email,
			accountId,
			fields.email
		);
	}
	if (fields.emailVerifiedAt !== undefined) {
		await dbRun(db, 'UPDATE users SET email_verified_at = ? WHERE account_id = ?', fields.emailVerifiedAt, accountId);
	}
}

export type VenueSignIn =
	/** A member of this venue's organisation: signed in as staff. */
	| { kind: 'member'; userId: string }
	/** Signed in as this venue's client row. */
	| { kind: 'client'; userId: string; created?: boolean; linked?: boolean }
	/** The Hallify password was right, but this venue already has a separate, unlinked
	 *  account for the address with another password. */
	| { kind: 'separate'; accountId: string }
	| null;

/**
 * Who an email and password sign in as on a venue's site. Order:
 *  1. the Hallify account, if the password opens it: as staff when it is a member of
 *     this venue, otherwise as its client row here (created and linked if missing; an
 *     old unlinked row is linked when the same password opens it too);
 *  2. an old, unlinked client row of this venue with its own password.
 */
export async function authenticateOnVenue(
	db: D1Database,
	orgId: string,
	email: string,
	password: string,
	compare: Compare = bcrypt.compare
): Promise<VenueSignIn> {
	const account = await findHallifyAccount(db, email);
	const client = await findClientRow(db, orgId, email);

	if (account && (await passwordOpens(compare, password, account.password_hash))) {
		if (await isMember(db, orgId, account.id)) return { kind: 'member', userId: account.id };
		if (!client) return { kind: 'client', userId: await createLinkedClient(db, orgId, account), created: true };
		if (client.account_id === account.id) return { kind: 'client', userId: client.id };
		if (!client.account_id) {
			if (await passwordOpens(compare, password, client.password_hash)) {
				await linkClientRow(db, client.id, account);
				return { kind: 'client', userId: client.id, linked: true };
			}
			return { kind: 'separate', accountId: account.id };
		}
		// Linked to some other account: not this person's row.
		return null;
	}

	if (client && !client.account_id && (await passwordOpens(compare, password, client.password_hash))) {
		return { kind: 'client', userId: client.id };
	}
	return null;
}

export type VenueRegistration =
	| { ok: true; accountId: string; clientId: string }
	| { ok: false; reason: 'hasAccount' | 'clientExists' };

/**
 * Sign-up on a venue's site creates the person's Hallify account and this venue's
 * client row, linked, in one go: the same email and password then work on every
 * venue site and on hallify.sk. An address that already has a Hallify account is told
 * to sign in with it instead.
 */
export async function registerOnVenue(
	db: D1Database,
	orgId: string,
	input: { email: string; passwordHash: string; firstName: string; lastName: string; locale?: string | null; verified?: boolean }
): Promise<VenueRegistration> {
	if (await findHallifyAccount(db, input.email)) return { ok: false, reason: 'hasAccount' };
	if (await findClientRow(db, orgId, input.email)) return { ok: false, reason: 'clientExists' };

	const accountId = crypto.randomUUID();
	const verifiedAt = input.verified ? new Date().toISOString() : null;
	try {
		await dbRun(
			db,
			`INSERT INTO users (id, email, password_hash, first_name, last_name, role, account_type, email_verified_at, locale)
			 VALUES (?, ?, ?, ?, ?, 'user', 'organization', ?, ?)`,
			accountId,
			input.email,
			input.passwordHash,
			input.firstName,
			input.lastName,
			verifiedAt,
			input.locale ?? null
		);
	} catch {
		// Lost a double-submit race against users_email_global_unique.
		return { ok: false, reason: 'hasAccount' };
	}
	const account: HallifyAccount = {
		id: accountId,
		email: input.email,
		password_hash: input.passwordHash,
		first_name: input.firstName,
		last_name: input.lastName,
		email_verified_at: verifiedAt,
		locale: input.locale ?? null,
		is_platform_admin: 0
	};
	try {
		const clientId = await createLinkedClient(db, orgId, account);
		return { ok: true, accountId, clientId };
	} catch {
		return { ok: false, reason: 'clientExists' };
	}
}

/** The account whose email a signed-in row stands for: a linked client row answers
 *  for its Hallify account, anything else for itself. */
export async function verificationTarget(
	db: D1Database,
	userId: string
): Promise<{ id: string; email: string; email_verified_at: string | null; org_id: string | null } | null> {
	const row = await dbFirst<{ id: string; email: string; email_verified_at: string | null; org_id: string | null; account_id: string | null }>(
		db,
		'SELECT id, email, email_verified_at, org_id, account_id FROM users WHERE id = ? AND deleted_at IS NULL',
		userId
	);
	if (!row) return null;
	if (row.account_id) {
		const account = await dbFirst<{ id: string; email: string; email_verified_at: string | null; org_id: string | null }>(
			db,
			'SELECT id, email, email_verified_at, org_id FROM users WHERE id = ? AND deleted_at IS NULL',
			row.account_id
		);
		if (account) return account;
	}
	return { id: row.id, email: row.email, email_verified_at: row.email_verified_at, org_id: row.org_id };
}

/** Sessions of an account's linked client rows (signed in on venue sites). */
export async function endLinkedSessions(db: D1Database, accountId: string): Promise<void> {
	await dbRun(db, 'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_id = ?)', accountId);
}
