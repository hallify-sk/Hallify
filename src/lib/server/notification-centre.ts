// The notification centre's storage (D12), migration 0033.
//
//   notifyOrg()      — called where something happens (a client books, writes,
//                      cancels; somebody joins; …). One row per event, for the org.
//   listNotifications / unreadNotificationCount — what one member sees: the areas
//                      their permissions open (see $lib/notification-centre), never
//                      what they did themselves, nothing from before they joined,
//                      and nothing older than RETENTION_DAYS.
//   markNotificationRead / markAllNotificationsRead — per member.
//
// Writing a notification must never break the action that caused it: notifyOrg
// logs and swallows every error (including a database the migration has not
// reached yet).

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import {
	NOTIFICATION_KINDS,
	notificationAreas,
	safeNotificationLink,
	type NotificationArea,
	type NotificationItem,
	type NotificationKind,
	type NotificationParams
} from '$lib/notification-centre';
import { orgPermissions } from './access';

/** Older notifications are neither shown nor kept. */
export const RETENTION_DAYS = 90;
/** How many the panel lists. */
export const PANEL_LIMIT = 30;
/** A repeat of the same event within this window updates the existing row (a
 *  client sending five messages in a row is one notification, brought to the top
 *  and unread again), so the panel is not flooded. */
export const DEDUPE_MINUTES = 60;

/** SQLite's "now" with milliseconds, the format created_at and read_until use. */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`;

export interface NotifyOrgInput {
	orgId: string;
	kind: NotificationKind;
	params?: NotificationParams;
	/** An app path, e.g. `/app/reservation/<id>`. Anything else is dropped. */
	link?: string | null;
	/** Who caused it: they are not notified of their own doing. */
	actorId?: string | null;
	/** Events with the same key within DEDUPE_MINUTES collapse into one. */
	dedupeKey?: string | null;
}

export async function notifyOrg(db: D1Database, input: NotifyOrgInput): Promise<void> {
	try {
		const area = NOTIFICATION_KINDS[input.kind];
		if (area === undefined) return;
		const params = JSON.stringify(input.params ?? {});
		const link = safeNotificationLink(input.link ?? null);
		const actor = input.actorId ?? null;

		if (input.dedupeKey) {
			const recent = await dbFirst<{ id: string }>(db,
				`SELECT id FROM org_notifications
				 WHERE org_id = ? AND dedupe_key = ? AND kind = ?
				   AND created_at > strftime('%Y-%m-%d %H:%M:%f', 'now', ?)
				 ORDER BY created_at DESC LIMIT 1`,
				input.orgId, input.dedupeKey, input.kind, `-${DEDUPE_MINUTES} minutes`);
			if (recent) {
				await dbRun(db,
					`UPDATE org_notifications SET params = ?, link = ?, actor_id = ?, created_at = ${NOW} WHERE id = ?`,
					params, link, actor, recent.id);
				// Unread again for everybody who had read the earlier version.
				await dbRun(db, 'DELETE FROM org_notification_reads WHERE notification_id = ?', recent.id);
				return;
			}
		}

		await dbRun(db,
			`INSERT INTO org_notifications (id, org_id, kind, area, params, link, actor_id, dedupe_key, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${NOW})`,
			crypto.randomUUID(), input.orgId, input.kind, area, params, link, actor, input.dedupeKey ?? null);

		// Keep the table to the retention window; cheap on the (org_id, created_at) index.
		await dbRun(db,
			`DELETE FROM org_notifications WHERE org_id = ? AND created_at < datetime('now', ?)`,
			input.orgId, `-${RETENTION_DAYS} days`);
	} catch (err) {
		console.error('notifyOrg failed:', input.kind, err);
	}
}

// ─── Event helpers for the features that report into the centre ─────────────
// One call at the place the event happens; each knows its kind, link and dedupe.

/** A client left (or edited) feedback on a completed event (D5). */
export function notifyFeedback(db: D1Database, e: {
	orgId: string; reservationId: string; title: string; client: string; rating: number; actorId: string;
}): Promise<void> {
	return notifyOrg(db, {
		orgId: e.orgId, kind: 'feedback.received',
		params: { title: e.title, client: e.client, rating: e.rating },
		link: `/app/reservation/${e.reservationId}`, actorId: e.actorId,
		// Editing the stars a minute later is the same feedback.
		dedupeKey: `feedback:${e.reservationId}`,
	});
}

/** A booking's payment changed: 'deposit_received', 'paid' or 'overdue' (D6). */
export function notifyPayment(db: D1Database, e: {
	orgId: string; reservationId: string; title: string; hall?: string; date?: string; client?: string;
	status: 'deposit_received' | 'paid' | 'overdue' | string; actorId?: string | null;
}): Promise<void> {
	return notifyOrg(db, {
		orgId: e.orgId, kind: 'payment.updated',
		params: { title: e.title, hall: e.hall, date: e.date, client: e.client, status: e.status },
		link: `/app/reservation/${e.reservationId}`, actorId: e.actorId ?? null,
		dedupeKey: `payment:${e.reservationId}:${e.status}`,
	});
}

/** Saving a hall's plan left templates or upcoming events with tables in walls,
 *  outside the room or on a removed floor (D2). Nothing is sent for zero problems. */
export async function notifyLayoutProblems(db: D1Database, e: {
	orgId: string; hallId: string; hall: string; templates: number; events: number; actorId?: string | null;
}): Promise<void> {
	if (e.templates <= 0 && e.events <= 0) return;
	await notifyOrg(db, {
		orgId: e.orgId, kind: 'layout.problems',
		params: { hall: e.hall, templates: e.templates, events: e.events },
		link: `/app/manage/halls/${e.hallId}`, actorId: e.actorId ?? null,
		dedupeKey: `layout:${e.hallId}`,
	});
}

/** Whose notifications, and from which areas. */
export interface NotificationViewer {
	orgId: string;
	userId: string;
	areas: NotificationArea[];
}

/** The signed-in member's viewer, or null when they have no organisation (a client
 *  account, a person who has not created or joined one yet). */
export async function notificationViewer(locals: App.Locals): Promise<NotificationViewer | null> {
	const org = locals.currentOrg;
	const user = locals.user;
	if (!org || !user || user.account_type === 'client') return null;
	return { orgId: org.id, userId: user.id, areas: notificationAreas(await orgPermissions(locals)) };
}

/** The WHERE clause for one viewer, and its parameters in order. */
function visibleTo(v: NotificationViewer): { sql: string; params: unknown[] } {
	const areaSql = v.areas.length
		? `(n.area IS NULL OR n.area IN (${v.areas.map(() => '?').join(', ')}))`
		: 'n.area IS NULL';
	return {
		sql: `n.org_id = ?
		  AND ${areaSql}
		  AND (n.actor_id IS NULL OR n.actor_id != ?)
		  AND n.created_at >= COALESCE((SELECT joined_at FROM organization_members WHERE org_id = ? AND user_id = ?), '')
		  AND n.created_at >= datetime('now', ?)`,
		params: [v.orgId, ...v.areas, v.userId, v.orgId, v.userId, `-${RETENTION_DAYS} days`]
	};
}

/** True when the viewer has not read it: after their "mark all" and not marked singly. */
const UNREAD_SQL = `(n.created_at > COALESCE((SELECT read_until FROM org_notification_marks WHERE org_id = ? AND user_id = ?), '')
	AND NOT EXISTS (SELECT 1 FROM org_notification_reads r WHERE r.notification_id = n.id AND r.user_id = ?))`;

export async function unreadNotificationCount(db: D1Database, v: NotificationViewer): Promise<number> {
	try {
		const w = visibleTo(v);
		const row = await dbFirst<{ n: number }>(db,
			`SELECT COUNT(*) AS n FROM org_notifications n WHERE ${w.sql} AND ${UNREAD_SQL}`,
			...w.params, v.orgId, v.userId, v.userId);
		return Number(row?.n ?? 0);
	} catch {
		return 0; // org_notifications arrives with migration 0033
	}
}

export async function listNotifications(
	db: D1Database,
	v: NotificationViewer,
	limit = PANEL_LIMIT
): Promise<{ items: NotificationItem[]; unread: number }> {
	try {
		const w = visibleTo(v);
		const rows = await dbAll<{ id: string; kind: string; params: string | null; link: string | null; created_at: string; unread: number }>(db,
			`SELECT n.id, n.kind, n.params, n.link, n.created_at, CASE WHEN ${UNREAD_SQL} THEN 1 ELSE 0 END AS unread
			 FROM org_notifications n
			 WHERE ${w.sql}
			 ORDER BY n.created_at DESC
			 LIMIT ?`,
			v.orgId, v.userId, v.userId, ...w.params, Math.max(1, Math.min(100, limit)));
		const items = rows.map((r) => ({
			id: r.id,
			kind: r.kind,
			params: parseParams(r.params),
			link: safeNotificationLink(r.link),
			created_at: r.created_at,
			read: !r.unread
		}));
		return { items, unread: await unreadNotificationCount(db, v) };
	} catch {
		return { items: [], unread: 0 };
	}
}

function parseParams(raw: string | null): NotificationParams {
	if (!raw) return {};
	try {
		const p = JSON.parse(raw);
		return p && typeof p === 'object' && !Array.isArray(p) ? (p as NotificationParams) : {};
	} catch {
		return {};
	}
}

/** Mark one read. Only a notification of the viewer's own organisation that they may
 *  see; anything else is ignored. */
export async function markNotificationRead(db: D1Database, v: NotificationViewer, id: string): Promise<boolean> {
	const w = visibleTo(v);
	const visible = await dbFirst<{ id: string }>(db,
		`SELECT n.id FROM org_notifications n WHERE n.id = ? AND ${w.sql}`, id, ...w.params);
	if (!visible) return false;
	await dbRun(db,
		`INSERT INTO org_notification_reads (notification_id, user_id) VALUES (?, ?)
		 ON CONFLICT (notification_id, user_id) DO NOTHING`,
		id, v.userId);
	return true;
}

/** Everything up to now is read for this member. */
export async function markAllNotificationsRead(db: D1Database, v: NotificationViewer): Promise<void> {
	await dbRun(db,
		`INSERT INTO org_notification_marks (org_id, user_id, read_until) VALUES (?, ?, ${NOW})
		 ON CONFLICT (org_id, user_id) DO UPDATE SET read_until = excluded.read_until`,
		v.orgId, v.userId);
	// Single reads before the mark mean nothing any more.
	await dbRun(db,
		`DELETE FROM org_notification_reads WHERE user_id = ?
		   AND notification_id IN (SELECT id FROM org_notifications WHERE org_id = ?)`,
		v.userId, v.orgId);
}
