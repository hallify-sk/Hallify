// The people an event is shared with (migration 0038), and their invitations.
//
// Staff add a client of the venue straight away, or invite an address; the owner
// invites by address only (they must not learn whether an address has an account,
// and the person agrees by accepting). An invitation is a link whose token is stored
// only as its SHA-256; accepting it binds the signed-in venue client and clears the
// token, so the link works once, and only for the address it was sent to.

import { dbAll, dbFirst, dbRun, wroteRow } from '$lib/db/index';
import { hashToken } from '$lib/server/account';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import type { D1Database } from '@cloudflare/workers-types';

/** How many people one event can be shared with (besides its owner). */
export const MAX_MEMBERS = 20;
/** How long an invitation link works. */
export const MEMBER_INVITE_DAYS = 30;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/;

export function isValidMemberEmail(email: string): boolean {
	return email.length <= 254 && EMAIL_RE.test(email);
}

export interface MemberRow {
	id: string;
	email: string;
	user_id: string | null;
	first_name: string | null;
	last_name: string | null;
	status: 'invited' | 'joined';
	expired: boolean;
	created_at: string;
	accepted_at: string | null;
}

/** Everyone the event is shared with, joined first. Empty before migration 0038. */
export async function listReservationMembers(db: D1Database, reservationId: string): Promise<MemberRow[]> {
	try {
		const rows = await dbAll<Omit<MemberRow, 'status' | 'expired'> & { expires_at: string | null }>(
			db,
			`SELECT rm.id, COALESCE(u.email, rm.email) AS email, rm.user_id, u.first_name, u.last_name,
			        rm.created_at, rm.accepted_at, rm.expires_at
			   FROM reservation_members rm
			   LEFT JOIN users u ON u.id = rm.user_id AND u.deleted_at IS NULL
			  WHERE rm.reservation_id = ?
			  ORDER BY rm.accepted_at IS NULL, rm.created_at`,
			reservationId
		);
		const now = Date.now();
		return rows.map(({ expires_at, ...r }) => ({
			...r,
			status: r.accepted_at ? 'joined' : 'invited',
			expired: !r.accepted_at && !!expires_at && new Date(expires_at).getTime() < now,
		}));
	} catch {
		return [];
	}
}

/** A fresh link token, and what is stored for it. */
export async function newInviteToken(now = Date.now()): Promise<{ token: string; hash: string; expiresAt: string }> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	return { token, hash: await hashToken(token), expiresAt: new Date(now + MEMBER_INVITE_DAYS * 86_400_000).toISOString() };
}

export type AddRefusal = 'owner' | 'already' | 'full';

async function memberCount(db: D1Database, reservationId: string): Promise<number> {
	const row = await dbFirst<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM reservation_members WHERE reservation_id = ?', reservationId);
	return Number(row?.n ?? 0);
}

/** Is this address (or this client row) already the booking's owner? */
async function isOwner(db: D1Database, reservationId: string, email: string, userId?: string | null): Promise<boolean> {
	const row = await dbFirst<{ n: number }>(
		db,
		`SELECT COUNT(*) AS n FROM reservations r JOIN users u ON u.id = r.user_id
		  WHERE r.id = ? AND (lower(u.email) = lower(?) OR u.id = ?)`,
		reservationId,
		email,
		userId ?? ''
	);
	return Number(row?.n ?? 0) > 0;
}

/**
 * Staff add an existing client of the venue: they can open the event at once. A
 * pending invitation to the same address becomes this membership.
 */
export async function addMemberDirect(
	db: D1Database,
	opts: { reservationId: string; userId: string; email: string; invitedBy: string | null }
): Promise<{ ok: true; id: string } | { ok: false; reason: AddRefusal }> {
	if (await isOwner(db, opts.reservationId, opts.email, opts.userId)) return { ok: false, reason: 'owner' };
	const existing = await dbFirst<{ id: string; accepted_at: string | null }>(
		db,
		`SELECT id, accepted_at FROM reservation_members
		  WHERE reservation_id = ? AND (user_id = ? OR lower(email) = lower(?))`,
		opts.reservationId,
		opts.userId,
		opts.email
	);
	if (existing?.accepted_at) return { ok: false, reason: 'already' };
	if (existing) {
		await dbRun(
			db,
			`UPDATE reservation_members SET user_id = ?, accepted_at = datetime('now'), invite_token = NULL, expires_at = NULL
			  WHERE id = ?`,
			opts.userId,
			existing.id
		);
		return { ok: true, id: existing.id };
	}
	if ((await memberCount(db, opts.reservationId)) >= MAX_MEMBERS) return { ok: false, reason: 'full' };
	const id = crypto.randomUUID();
	await dbRun(
		db,
		`INSERT INTO reservation_members (id, reservation_id, user_id, email, role, invited_by, accepted_at)
		 VALUES (?, ?, ?, ?, 'guest', ?, datetime('now'))`,
		id,
		opts.reservationId,
		opts.userId,
		opts.email.toLowerCase(),
		opts.invitedBy
	);
	return { ok: true, id };
}

/**
 * Invite an address. A pending invitation to it gets a fresh link (the old one stops
 * working); a joined member or the owner is refused. Returns the link's token.
 */
export async function inviteMember(
	db: D1Database,
	opts: { reservationId: string; email: string; invitedBy: string | null }
): Promise<{ ok: true; id: string; token: string; renewed: boolean } | { ok: false; reason: AddRefusal }> {
	const email = opts.email.trim().toLowerCase();
	if (await isOwner(db, opts.reservationId, email)) return { ok: false, reason: 'owner' };
	const existing = await dbFirst<{ id: string; accepted_at: string | null }>(
		db,
		'SELECT id, accepted_at FROM reservation_members WHERE reservation_id = ? AND lower(email) = ?',
		opts.reservationId,
		email
	);
	if (existing?.accepted_at) return { ok: false, reason: 'already' };
	const t = await newInviteToken();
	if (existing) {
		await dbRun(
			db,
			'UPDATE reservation_members SET invite_token = ?, expires_at = ?, invited_by = COALESCE(?, invited_by) WHERE id = ?',
			t.hash,
			t.expiresAt,
			opts.invitedBy,
			existing.id
		);
		return { ok: true, id: existing.id, token: t.token, renewed: true };
	}
	if ((await memberCount(db, opts.reservationId)) >= MAX_MEMBERS) return { ok: false, reason: 'full' };
	const id = crypto.randomUUID();
	await dbRun(
		db,
		`INSERT INTO reservation_members (id, reservation_id, email, role, invited_by, invite_token, expires_at)
		 VALUES (?, ?, ?, 'guest', ?, ?, ?)`,
		id,
		opts.reservationId,
		email,
		opts.invitedBy,
		t.hash,
		t.expiresAt
	);
	return { ok: true, id, token: t.token, renewed: false };
}

/** A fresh link for a pending invitation of this booking; null when there is none. */
export async function renewMemberInvite(
	db: D1Database,
	reservationId: string,
	memberId: string
): Promise<{ email: string; token: string } | null> {
	const row = await dbFirst<{ email: string }>(
		db,
		'SELECT email FROM reservation_members WHERE id = ? AND reservation_id = ? AND accepted_at IS NULL',
		memberId,
		reservationId
	);
	if (!row) return null;
	const t = await newInviteToken();
	await dbRun(db, 'UPDATE reservation_members SET invite_token = ?, expires_at = ? WHERE id = ?', t.hash, t.expiresAt, memberId);
	return { email: row.email, token: t.token };
}

/** Remove a person (or withdraw an invitation). Returns who it was, or null. */
export async function removeMember(
	db: D1Database,
	reservationId: string,
	memberId: string
): Promise<{ email: string; name: string | null } | null> {
	const row = await dbFirst<{ email: string; first_name: string | null; last_name: string | null }>(
		db,
		`SELECT COALESCE(u.email, rm.email) AS email, u.first_name, u.last_name
		   FROM reservation_members rm LEFT JOIN users u ON u.id = rm.user_id
		  WHERE rm.id = ? AND rm.reservation_id = ?`,
		memberId,
		reservationId
	);
	if (!row) return null;
	const res = await dbRun(db, 'DELETE FROM reservation_members WHERE id = ? AND reservation_id = ?', memberId, reservationId);
	if (!wroteRow(res)) return null;
	const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || null;
	return { email: row.email, name };
}

/** The new owner of a booking is no longer also one of its members. */
export async function dropOwnerMembership(db: D1Database, reservationId: string, ownerId: string): Promise<void> {
	try {
		await dbRun(db, 'DELETE FROM reservation_members WHERE reservation_id = ? AND user_id = ?', reservationId, ownerId);
	} catch {
		/* before migration 0038 */
	}
}

export interface InviteView {
	id: string;
	reservation_id: string;
	org_id: string;
	email: string;
	expires_at: string | null;
	res_title: string;
	res_status: string;
	event_date: string;
	hall_name: string;
	org_name: string;
}

/** The pending invitation behind a link, or null. */
export async function findMemberInvite(db: D1Database, token: string): Promise<InviteView | null> {
	if (!/^[0-9a-f]{64}$/.test(token)) return null;
	try {
		return await dbFirst<InviteView>(
			db,
			`SELECT rm.id, rm.reservation_id, r.org_id, rm.email, rm.expires_at,
			        r.title AS res_title, r.status AS res_status, r.event_date, h.name AS hall_name, o.name AS org_name
			   FROM reservation_members rm
			   JOIN reservations r ON r.id = rm.reservation_id
			   JOIN halls h ON h.id = r.hall_id
			   JOIN organizations o ON o.id = r.org_id
			  WHERE rm.invite_token = ? AND rm.accepted_at IS NULL`,
			await hashToken(token)
		);
	} catch {
		return null;
	}
}

export type AcceptRefusal = 'notFound' | 'expired' | 'cancelled' | 'emailMismatch' | 'wrongVenue';

export function inviteState(invite: InviteView | null, now = Date.now()): AcceptRefusal | null {
	if (!invite) return 'notFound';
	if (invite.res_status === 'cancelled') return 'cancelled';
	if (invite.expires_at && new Date(invite.expires_at).getTime() < now) return 'expired';
	return null;
}

/**
 * Accept the invitation behind `token` as the signed-in venue client `user`. The
 * account's address must be the invited one: a forwarded link does not let somebody
 * else in. The owner opening it simply lands on their booking.
 */
export async function acceptMemberInvite(
	db: D1Database,
	token: string,
	user: { id: string; email: string; account_type: string | null; org_id: string | null },
	orgId: string
): Promise<{ ok: true; reservationId: string; memberId: string | null } | { ok: false; reason: AcceptRefusal }> {
	const invite = await findMemberInvite(db, token);
	const dead = inviteState(invite);
	if (dead || !invite) return { ok: false, reason: dead ?? 'notFound' };
	if (invite.org_id !== orgId || user.account_type !== 'client' || user.org_id !== orgId) return { ok: false, reason: 'wrongVenue' };
	if (user.email.trim().toLowerCase() !== invite.email.trim().toLowerCase()) return { ok: false, reason: 'emailMismatch' };

	if (await isOwner(db, invite.reservation_id, user.email, user.id)) {
		await dbRun(db, 'DELETE FROM reservation_members WHERE id = ?', invite.id);
		return { ok: true, reservationId: invite.reservation_id, memberId: null };
	}
	// Single use: only the request that clears the token accepts.
	let claimed = false;
	try {
		claimed = wroteRow(await dbRun(
			db,
			`UPDATE reservation_members SET user_id = ?, accepted_at = datetime('now'), invite_token = NULL, expires_at = NULL
			  WHERE id = ? AND invite_token IS NOT NULL AND accepted_at IS NULL`,
			user.id,
			invite.id
		));
	} catch {
		// Already a member through another row (an address changed since): this one goes.
		await dbRun(db, 'DELETE FROM reservation_members WHERE id = ?', invite.id);
		return { ok: true, reservationId: invite.reservation_id, memberId: null };
	}
	if (!claimed) return { ok: false, reason: 'notFound' };
	return { ok: true, reservationId: invite.reservation_id, memberId: invite.id };
}

/**
 * Where the venue's own site is, for links in these emails: the request's origin when
 * the request is on that site, else its public address, else (locally) the venue's
 * subdomain of the current host.
 */
export async function venueSiteBase(db: D1Database, orgId: string, url: URL, onVenueSite: boolean): Promise<string> {
	if (onVenueSite) return url.origin;
	const pub = await orgPublicBaseUrl(db, orgId, url);
	if (pub) return pub;
	const org = await dbFirst<{ slug: string }>(db, 'SELECT slug FROM organizations WHERE id = ?', orgId);
	return org ? `${url.protocol}//${org.slug}.${url.host}` : url.origin;
}

/** The invitation link on the venue's site. */
export function memberInviteUrl(base: string, token: string): string {
	return `${base.replace(/\/$/, '')}/halls/join/${token}`;
}

/** Addresses of everyone the event is shared with who has joined, but `except`. */
export async function memberEmails(db: D1Database, reservationId: string, except: string | null = null): Promise<string[]> {
	try {
		const rows = await dbAll<{ email: string }>(
			db,
			`SELECT DISTINCT u.email FROM reservation_members rm JOIN users u ON u.id = rm.user_id
			  WHERE rm.reservation_id = ? AND rm.accepted_at IS NOT NULL AND u.deleted_at IS NULL`,
			reservationId
		);
		const skip = except?.toLowerCase() ?? null;
		return rows.map((r) => r.email).filter((e) => !!e && e.toLowerCase() !== skip);
	} catch {
		return [];
	}
}
