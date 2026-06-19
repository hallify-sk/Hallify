// ─── Platform → organization announcements ────────────────────────────────
// Superadmins broadcast announcements to all orgs or specific ones. Shown to the
// targeted orgs' owners/admins; read state is per-user.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export type AnnouncementLevel = 'info' | 'success' | 'warning' | 'error';

export interface AnnouncementRow {
	id: string;
	created_by: string | null;
	level: AnnouncementLevel;
	title: string;
	body: string;
	audience: 'all' | 'specific';
	email_sent: number;
	created_at: string;
}

/** Announcements visible to an org = broadcast-to-all OR explicitly targeted. */
const VISIBLE_CLAUSE =
	"(a.audience = 'all' OR a.id IN (SELECT announcement_id FROM announcement_targets WHERE org_id = ?))";

/** Count of announcements this org's user hasn't read yet. */
export async function unreadAnnouncementCount(db: D1Database, userId: string, orgId: string): Promise<number> {
	const row = await dbFirst<{ n: number }>(db,
		`SELECT COUNT(*) AS n FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
		orgId, userId);
	return row?.n ?? 0;
}

/** Unread announcements (lightweight) — used by the poll to decide the sound. */
export async function unreadAnnouncements(db: D1Database, userId: string, orgId: string) {
	return dbAll<{ id: string; level: AnnouncementLevel; title: string; created_at: string }>(db,
		`SELECT a.id, a.level, a.title, a.created_at FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)
		 ORDER BY a.created_at DESC`,
		orgId, userId);
}

/** Full list for the announcements page, with a per-user read flag + author. */
export async function listAnnouncementsForOrg(db: D1Database, userId: string, orgId: string) {
	return dbAll<{ id: string; level: AnnouncementLevel; title: string; body: string; created_at: string; author: string | null; read: number }>(db,
		`SELECT a.id, a.level, a.title, a.body, a.created_at,
		        (u.first_name || ' ' || u.last_name) AS author,
		        (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS read
		 FROM announcements a
		 LEFT JOIN users u ON u.id = a.created_by
		 WHERE ${VISIBLE_CLAUSE}
		 ORDER BY a.created_at DESC`,
		userId, orgId);
}

/** Mark every announcement currently visible to this user/org as read. */
export async function markAnnouncementsRead(db: D1Database, userId: string, orgId: string): Promise<void> {
	await dbRun(db,
		`INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id)
		 SELECT a.id, ? FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
		userId, orgId, userId);
}

/** Create an announcement (+ targets for 'specific'). Returns its id + target orgs. */
export async function createAnnouncement(db: D1Database, opts: {
	createdBy: string;
	level: AnnouncementLevel;
	title: string;
	body: string;
	audience: 'all' | 'specific';
	orgIds: string[];
	emailSent: boolean;
}): Promise<{ id: string; targetOrgIds: string[] }> {
	const id = crypto.randomUUID();
	await dbRun(db,
		`INSERT INTO announcements (id, created_by, level, title, body, audience, email_sent)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, opts.createdBy, opts.level, opts.title, opts.body, opts.audience, opts.emailSent ? 1 : 0);

	let targetOrgIds = opts.orgIds;
	if (opts.audience === 'specific') {
		for (const oid of opts.orgIds) {
			await dbRun(db, 'INSERT OR IGNORE INTO announcement_targets (announcement_id, org_id) VALUES (?, ?)', id, oid);
		}
	} else {
		const all = await dbAll<{ id: string }>(db, 'SELECT id FROM organizations WHERE suspended_at IS NULL');
		targetOrgIds = all.map((o) => o.id);
	}
	return { id, targetOrgIds };
}
