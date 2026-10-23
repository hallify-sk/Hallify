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
	expires_at: string | null;
	updated_at: string | null;
}

/** Announcements visible to an org: explicitly targeted, or broadcast to all while
 *  the org already existed. An 'all' announcement is addressed to the organisations
 *  of its day — a venue that signs up a year later must not open its console to old
 *  maintenance notices. Expired announcements are hidden everywhere.
 *  Takes the org id TWICE as parameters. */
const VISIBLE_CLAUSE =
	`((a.audience = 'all' AND a.created_at >= COALESCE((SELECT o.created_at FROM organizations o WHERE o.id = ?), ''))
	   OR a.id IN (SELECT announcement_id FROM announcement_targets WHERE org_id = ?))
	 AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))`;

/** Count of announcements this org's user hasn't read yet. */
export async function unreadAnnouncementCount(db: D1Database, userId: string, orgId: string): Promise<number> {
	const row = await dbFirst<{ n: number }>(db,
		`SELECT COUNT(*) AS n FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
		orgId, orgId, userId);
	return row?.n ?? 0;
}

/** Unread announcements (lightweight) — used by the poll to decide the sound. */
export async function unreadAnnouncements(db: D1Database, userId: string, orgId: string) {
	return dbAll<{ id: string; level: AnnouncementLevel; title: string; created_at: string }>(db,
		`SELECT a.id, a.level, a.title, a.created_at FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)
		 ORDER BY a.created_at DESC`,
		orgId, orgId, userId);
}

/** Full list for the announcements page, with a per-user read flag. Signed by
 *  Hallify, not by the admin who wrote it: it speaks for the platform, and an
 *  admin's personal name means nothing to a venue. */
export async function listAnnouncementsForOrg(db: D1Database, userId: string, orgId: string) {
	return dbAll<{ id: string; level: AnnouncementLevel; title: string; body: string; created_at: string; updated_at: string | null; read: number }>(db,
		`SELECT a.id, a.level, a.title, a.body, a.created_at, a.updated_at,
		        (SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS read
		 FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		 ORDER BY a.created_at DESC`,
		userId, orgId, orgId);
}

/** Mark every announcement currently visible to this user/org as read. */
export async function markAnnouncementsRead(db: D1Database, userId: string, orgId: string): Promise<void> {
	await dbRun(db,
		`INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id)
		 SELECT a.id, ? FROM announcements a
		 WHERE ${VISIBLE_CLAUSE}
		   AND a.id NOT IN (SELECT announcement_id FROM announcement_reads WHERE user_id = ?)`,
		userId, orgId, orgId, userId);
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
	expiresAt?: string | null;
}): Promise<{ id: string; targetOrgIds: string[] }> {
	const id = crypto.randomUUID();
	await dbRun(db,
		`INSERT INTO announcements (id, created_by, level, title, body, audience, email_sent, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, opts.createdBy, opts.level, opts.title, opts.body, opts.audience, opts.emailSent ? 1 : 0, opts.expiresAt ?? null);

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

/** Edit an announcement's wording, level or end date. The audience stays as
 *  published: changing who it was addressed to afterwards would rewrite what those
 *  organisations were told. */
export async function updateAnnouncement(db: D1Database, id: string, opts: {
	level: AnnouncementLevel; title: string; body: string; expiresAt: string | null;
}): Promise<void> {
	await dbRun(db,
		`UPDATE announcements SET level = ?, title = ?, body = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?`,
		opts.level, opts.title, opts.body, opts.expiresAt, id);
}

/** Record how many email copies went out, so the list says what really happened. */
export async function recordAnnouncementEmails(db: D1Database, id: string, delivered: number, failed: number): Promise<void> {
	await dbRun(db, 'UPDATE announcements SET emails_delivered = ?, emails_failed = ? WHERE id = ?', delivered, failed, id);
}

/** A date input ('YYYY-MM-DD') as the end of that day in UTC, or null when empty or
 *  not a real date. */
export function expiryFromDateInput(raw: unknown): string | null {
	const s = String(raw ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const d = new Date(`${s}T00:00:00Z`);
	if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
	return `${s} 23:59:59`;
}
