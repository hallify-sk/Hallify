// Self-service account deletion (D7). See DESIGN-identity.md.
//
// Deleting an account must not take a venue down with it, keep charging anyone, or
// leave a venue's records dangling. In order:
//  1. the last platform admin is refused;
//  2. each organisation the person owns is handed to the next person (administrators
//     first, then members, each by join date) with the subscription set to end and
//     every hall made private, or, with nobody else in it, closed exactly as
//     Settings → Close does; other memberships are simply removed;
//  3. their bookings, on the Hallify account and on every venue row linked to it:
//     upcoming ones are cancelled (the venue is told), all are kept for the venue's
//     records with the person anonymised;
//  4. the account itself: sessions and mailed links go, and the row is deleted, or
//     anonymised when records still point at it.
//
// Side effects outside the database (Stripe, closing an org, email) come in through
// `DeletionDeps`, so the order and the data rules are tested without them.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { dispatchPlatformEvent } from '$lib/server/platform-webhooks';
import { revokeUserGrants } from '$lib/server/mcp/oauth';

export type OrgOutcome =
	/** Owner with nobody else to take over: the organisation is closed. */
	| 'close'
	/** Owner: the next person becomes owner. */
	| 'handOver'
	/** Owner, but another owner remains: only the membership goes. */
	| 'coOwner'
	/** Admin or member: only the membership goes. */
	| 'leave';

export interface OrgPlan {
	orgId: string;
	name: string;
	outcome: OrgOutcome;
	newOwner?: { id: string; name: string; email: string; locale: string | null };
}

export interface DeletionPlan {
	/** Why it cannot be done, or null. */
	refused: 'lastPlatformAdmin' | null;
	orgs: OrgPlan[];
	/** Upcoming bookings that will be cancelled. */
	upcoming: number;
	/** Bookings kept, anonymised, for the venues' records. */
	past: number;
}

export interface CancelledBooking {
	id: string;
	org_id: string;
	title: string;
	hall_name: string;
	event_date: string;
	guestName: string;
}

export interface DeletionDeps {
	/** Set an organisation's Stripe subscription to end (no further charges). Throws on failure. */
	endSubscription(subscriptionId: string): Promise<void>;
	/** Close an organisation as Settings → Close does. Throws when billing could not be stopped. */
	closeOrg(orgId: string): Promise<void>;
	/** Tell the new owner. Failures are swallowed by the caller. */
	notifyNewOwner(o: { orgId: string; orgName: string; to: { email: string; locale: string | null; name: string }; previousOwner: string }): Promise<void>;
	/** Tell the venue that a booking was cancelled. Failures are swallowed by the caller. */
	notifyCancelled(b: CancelledBooking): Promise<void>;
	/** Today as YYYY-MM-DD (the booking day boundary). */
	today?: string;
}

export type DeletionResult =
	| { ok: true; cancelled: number; anonymised: number; closed: string[]; handedOver: string[] }
	| { ok: false; reason: 'notFound' | 'lastPlatformAdmin' }
	| { ok: false; reason: 'billing'; org: string };

/** The anonymised identity a deleted person's kept rows carry. */
export const DELETED_FIRST_NAME = 'Zmazaný';
export const DELETED_LAST_NAME = 'klient';
export const DELETED_PASSWORD = '!deleted';
export const deletedEmail = (id: string) => `deleted-${id}@deleted.invalid`;

const UPCOMING_SQL = `event_date >= ? AND status NOT IN ('cancelled', 'completed')`;

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

/** The person's own row and every venue row linked to it. */
async function personRows(db: D1Database, userId: string): Promise<string[]> {
	const linked = await dbAll<{ id: string }>(db, 'SELECT id FROM users WHERE account_id = ? AND deleted_at IS NULL', userId);
	return [userId, ...linked.map((r) => r.id)];
}

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/** What deleting `userId` would do; shown on the profile before anyone confirms. */
export async function planAccountDeletion(db: D1Database, userId: string, today = todayISO()): Promise<DeletionPlan | null> {
	const user = await dbFirst<{ id: string; is_platform_admin: number }>(
		db,
		'SELECT id, is_platform_admin FROM users WHERE id = ? AND deleted_at IS NULL',
		userId
	);
	if (!user) return null;

	let refused: DeletionPlan['refused'] = null;
	if (user.is_platform_admin) {
		const admins = await dbFirst<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM users WHERE is_platform_admin = 1 AND deleted_at IS NULL');
		if (Number(admins?.n ?? 0) <= 1) refused = 'lastPlatformAdmin';
	}

	const memberships = await dbAll<{ org_id: string; name: string; role: string }>(
		db,
		`SELECT m.org_id, o.name, m.role FROM organization_members m JOIN organizations o ON o.id = m.org_id
		  WHERE m.user_id = ? ORDER BY m.joined_at`,
		userId
	);
	const orgs: OrgPlan[] = [];
	for (const m of memberships) {
		if (m.role !== 'owner') {
			orgs.push({ orgId: m.org_id, name: m.name, outcome: 'leave' });
			continue;
		}
		const otherOwner = await dbFirst<{ ok: number }>(
			db,
			`SELECT 1 AS ok FROM organization_members WHERE org_id = ? AND user_id != ? AND role = 'owner' LIMIT 1`,
			m.org_id,
			userId
		);
		if (otherOwner) {
			orgs.push({ orgId: m.org_id, name: m.name, outcome: 'coOwner' });
			continue;
		}
		const next = await dbFirst<{ id: string; first_name: string; last_name: string; email: string; locale: string | null }>(
			db,
			`SELECT u.id, u.first_name, u.last_name, u.email, u.locale
			   FROM organization_members m JOIN users u ON u.id = m.user_id
			  WHERE m.org_id = ? AND m.user_id != ? AND u.deleted_at IS NULL
			  ORDER BY CASE m.role WHEN 'admin' THEN 0 ELSE 1 END, m.joined_at, u.created_at
			  LIMIT 1`,
			m.org_id,
			userId
		);
		orgs.push(
			next
				? {
						orgId: m.org_id,
						name: m.name,
						outcome: 'handOver',
						newOwner: { id: next.id, name: `${next.first_name} ${next.last_name}`.trim(), email: next.email, locale: next.locale }
					}
				: { orgId: m.org_id, name: m.name, outcome: 'close' }
		);
	}

	// Bookings at organisations being closed go with them; the rest are counted.
	const closing = orgs.filter((o) => o.outcome === 'close').map((o) => o.orgId);
	const rows = await personRows(db, userId);
	const notClosing = closing.length ? ` AND (org_id IS NULL OR org_id NOT IN (${placeholders(closing.length)}))` : '';
	const counts = await dbFirst<{ upcoming: number; total: number }>(
		db,
		`SELECT SUM(CASE WHEN ${UPCOMING_SQL} THEN 1 ELSE 0 END) AS upcoming, COUNT(*) AS total
		   FROM reservations WHERE user_id IN (${placeholders(rows.length)})${notClosing}`,
		today,
		...rows,
		...closing
	);
	const upcoming = Number(counts?.upcoming ?? 0);
	return { refused, orgs, upcoming, past: Number(counts?.total ?? 0) - upcoming };
}

/** Remove one membership with what was granted with it. */
async function removeMembership(db: D1Database, orgId: string, userId: string): Promise<void> {
	await dbRun(db, 'DELETE FROM org_member_roles WHERE org_id = ? AND user_id = ?', orgId, userId);
	await dbRun(db, 'DELETE FROM org_member_overrides WHERE org_id = ? AND user_id = ?', orgId, userId);
	await dbRun(db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
}

/** Strip a row of everything that identifies the person; it stays only so that the
 *  venue's records (bookings, threads) keep pointing at something. */
async function anonymise(db: D1Database, id: string, at: string): Promise<void> {
	await dbRun(
		db,
		`UPDATE users SET email = ?, first_name = ?, last_name = ?, password_hash = ?, account_id = NULL,
		        is_platform_admin = 0, email_verified_at = NULL, locale = NULL, deleted_at = ?
		  WHERE id = ?`,
		deletedEmail(id),
		DELETED_FIRST_NAME,
		DELETED_LAST_NAME,
		DELETED_PASSWORD,
		at,
		id
	);
}

/** Records that still need a user row: those with no ON DELETE action, and messages
 *  the person sent in other people's conversations (deleting would cascade them away,
 *  and with them a venue's replies to its clients or a team's history). */
async function stillReferenced(db: D1Database, id: string): Promise<boolean> {
	const row = await dbFirst<{ n: number }>(
		db,
		`SELECT (SELECT COUNT(*) FROM reservations WHERE user_id = ?)
		      + (SELECT COUNT(*) FROM organization_invites WHERE invited_by = ?)
		      + (SELECT COUNT(*) FROM setup_requests WHERE requested_by = ?)
		      + (SELECT COUNT(*) FROM floorplan_requests WHERE requested_by = ?)
		      + (SELECT COUNT(*) FROM messages m JOIN tickets t ON t.id = m.ticket_id WHERE m.sender_id = ? AND t.user_id != ?)
		      + (SELECT COUNT(*) FROM channel_messages WHERE sender_id = ?) AS n`,
		id,
		id,
		id,
		id,
		id,
		id,
		id
	);
	return Number(row?.n ?? 0) > 0;
}

/** Delete a user row, or anonymise it when the venue's records still need it. */
async function deleteOrAnonymise(db: D1Database, id: string, at: string): Promise<'deleted' | 'anonymised'> {
	await dbRun(db, 'DELETE FROM sessions WHERE user_id = ?', id);
	// Connected AI agents lose their tokens with the account (and the grants go with
	// the row when it is deleted).
	await revokeUserGrants(db, id, 'account_deleted');
	await dbRun(db, 'DELETE FROM password_resets WHERE user_id = ?', id);
	await dbRun(db, 'DELETE FROM email_verifications WHERE user_id = ?', id);
	await dbRun(db, 'DELETE FROM reservation_holds WHERE user_id = ?', id);
	await dbRun(db, 'UPDATE reservation_invites SET invited_by = NULL WHERE invited_by = ?', id);
	// Events shared with them, and invitations to their address, go; events they shared
	// with others stay shared, without saying who did it (0038).
	await dbRun(db,
		`DELETE FROM reservation_members
		  WHERE user_id = ? OR (accepted_at IS NULL AND lower(email) = (SELECT lower(email) FROM users WHERE id = ?))`,
		id, id).catch(() => {});
	await dbRun(db, 'UPDATE reservation_members SET invited_by = NULL WHERE invited_by = ?', id).catch(() => {});
	if (!(await stillReferenced(db, id))) {
		try {
			await dbRun(db, 'DELETE FROM users WHERE id = ?', id);
			return 'deleted';
		} catch {
			// A reference this list does not know about: keep the row, without the person.
		}
	}
	await anonymise(db, id, at);
	return 'anonymised';
}

/**
 * Delete `userId`'s account. See the top of this file for the order. Returns why it
 * was refused, or what was done. Stops before deleting anything personal when the
 * subscription of an organisation they own cannot be stopped.
 */
export async function deleteAccount(db: D1Database, userId: string, deps: DeletionDeps): Promise<DeletionResult> {
	const today = deps.today ?? todayISO();
	const plan = await planAccountDeletion(db, userId, today);
	if (!plan) return { ok: false, reason: 'notFound' };
	if (plan.refused) return { ok: false, reason: plan.refused };

	const me = await dbFirst<{ first_name: string; last_name: string }>(db, 'SELECT first_name, last_name FROM users WHERE id = ?', userId);
	const myName = `${me?.first_name ?? ''} ${me?.last_name ?? ''}`.trim();

	// ── Billing first: nothing personal is removed while a venue could still be charged.
	for (const org of plan.orgs.filter((o) => o.outcome === 'handOver')) {
		const sub = await dbFirst<{ stripe_subscription_id: string | null; status: string | null }>(
			db,
			'SELECT stripe_subscription_id, status FROM subscriptions WHERE org_id = ?',
			org.orgId
		);
		if (sub?.stripe_subscription_id && sub.status !== 'cancelled') {
			try {
				await deps.endSubscription(sub.stripe_subscription_id);
			} catch {
				return { ok: false, reason: 'billing', org: org.name };
			}
		}
	}
	const closed: string[] = [];
	for (const org of plan.orgs.filter((o) => o.outcome === 'close')) {
		try {
			await deps.closeOrg(org.orgId);
		} catch {
			return { ok: false, reason: 'billing', org: org.name };
		}
		closed.push(org.name);
	}

	// ── Organisations that carry on.
	const handedOver: string[] = [];
	for (const org of plan.orgs) {
		if (org.outcome === 'close') continue;
		if (org.outcome === 'handOver' && org.newOwner) {
			await dbRun(db, `UPDATE organization_members SET role = 'owner' WHERE org_id = ? AND user_id = ?`, org.orgId, org.newOwner.id);
			// Nothing is published or paid for without the new owner knowing.
			await dbRun(db, 'UPDATE halls SET is_public = 0 WHERE org_id = ?', org.orgId);
			handedOver.push(org.name);
			try {
				await deps.notifyNewOwner({
					orgId: org.orgId,
					orgName: org.name,
					to: { email: org.newOwner.email, locale: org.newOwner.locale, name: org.newOwner.name },
					previousOwner: myName
				});
			} catch {
				/* the hand-over stands; the email is a courtesy */
			}
		}
		await removeMembership(db, org.orgId, userId);
	}
	await dbRun(db, 'UPDATE sessions SET current_org_id = NULL WHERE user_id = ?', userId);

	// ── Bookings: upcoming ones are cancelled and the venue told, while the names are real.
	const rows = await personRows(db, userId);
	const upcoming = await dbAll<CancelledBooking & { first_name: string; last_name: string }>(
		db,
		`SELECT r.id, r.org_id, r.title, r.event_date, COALESCE(h.name, '') AS hall_name, u.first_name, u.last_name
		   FROM reservations r JOIN users u ON u.id = r.user_id LEFT JOIN halls h ON h.id = r.hall_id
		  WHERE r.user_id IN (${placeholders(rows.length)}) AND r.event_date >= ? AND r.status NOT IN ('cancelled', 'completed')`,
		...rows,
		today
	);
	for (const b of upcoming) {
		await dbRun(db, `UPDATE reservations SET status = 'cancelled', cancelled_by = 'client' WHERE id = ?`, b.id);
		try {
			await deps.notifyCancelled({
				id: b.id,
				org_id: b.org_id,
				title: b.title,
				hall_name: b.hall_name,
				event_date: b.event_date,
				guestName: `${b.first_name} ${b.last_name}`.trim()
			});
		} catch {
			/* the cancellation stands */
		}
	}

	// ── The rows themselves: venue rows first (they point at the account), then the account.
	const at = new Date().toISOString();
	let anonymised = 0;
	for (const id of rows.slice(1)) {
		if ((await deleteOrAnonymise(db, id, at)) === 'anonymised') anonymised++;
	}
	if ((await deleteOrAnonymise(db, userId, at)) === 'anonymised') anonymised++;
	// The id only: the person asked to be removed, so their address is not sent on.
	dispatchPlatformEvent(db, 'user.deleted', { user_id: userId, orgs_closed: closed.length, orgs_handed_over: handedOver.length });

	return { ok: true, cancelled: upcoming.length, anonymised, closed, handedOver };
}
