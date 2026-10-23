import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { createAnnouncement, updateAnnouncement, recordAnnouncementEmails, expiryFromDateInput } from '$lib/announcements';
import type { AnnouncementLevel } from '$lib/announcements';
import { sendAnnouncementEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { logPlatformAction } from '$lib/server/platform-audit';
import type { PageServerLoad, Actions } from './$types';
import { requirePlatformAdmin } from '$lib/guards';

const LEVELS: AnnouncementLevel[] = ['info', 'success', 'warning', 'error'];

export const load: PageServerLoad = async ({ locals }) => {
	const orgs = await dbAll<{ id: string; name: string; slug: string }>(locals.db,
		'SELECT id, name, slug FROM organizations WHERE suspended_at IS NULL ORDER BY name');

	// 'all' reaches the organisations that existed when it was published (see
	// $lib/announcements), so that is what the count says too.
	const announcements = await dbAll<{
		id: string; level: string; title: string; body: string; audience: string;
		email_sent: number; emails_delivered: number | null; emails_failed: number | null;
		created_at: string; updated_at: string | null; expires_at: string | null;
		target_count: number; read_count: number; expired: number;
	}>(locals.db, `
		SELECT a.id, a.level, a.title, a.body, a.audience, a.email_sent, a.emails_delivered, a.emails_failed,
		       a.created_at, a.updated_at, a.expires_at,
		       CASE WHEN a.expires_at IS NOT NULL AND a.expires_at <= datetime('now') THEN 1 ELSE 0 END AS expired,
		       CASE WHEN a.audience = 'all'
		            THEN (SELECT COUNT(*) FROM organizations o WHERE o.suspended_at IS NULL AND o.created_at <= a.created_at)
		            ELSE (SELECT COUNT(*) FROM announcement_targets t WHERE t.announcement_id = a.id) END AS target_count,
		       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count
		FROM announcements a ORDER BY a.created_at DESC LIMIT 50`);

	return { orgs, announcements };
};

function readFields(data: FormData, locale: App.Locals['locale']) {
	const level = String(data.get('level') ?? 'info') as AnnouncementLevel;
	const title = String(data.get('title') ?? '').trim().slice(0, 120);
	const body = String(data.get('body') ?? '').trim().slice(0, 4000);
	const rawExpiry = String(data.get('expires') ?? '').trim();
	const expiresAt = expiryFromDateInput(rawExpiry);
	const t = st(locale);
	if (!LEVELS.includes(level)) return { error: t.serverErrors.invalidLevel };
	if (!title) return { error: t.serverErrors.titleRequired };
	if (!body) return { error: t.serverErrors.messageRequired };
	if (rawExpiry && !expiresAt) return { error: t.platformMisc.announcementBadExpiry };
	return { level, title, body, expiresAt };
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const f = readFields(data, locals.locale);
		if ('error' in f) return fail(400, { error: f.error });
		const audience = String(data.get('audience') ?? 'all') === 'specific' ? 'specific' : 'all';
		const orgIds = data.getAll('orgIds').map(String).filter(Boolean);
		const emailCopy = data.get('emailCopy') != null;
		if (audience === 'specific' && orgIds.length === 0) return fail(400, { error: st(locals.locale).serverErrors.selectAtLeastOneOrganization });

		const { id, targetOrgIds } = await createAnnouncement(locals.db, {
			createdBy: locals.user!.id, level: f.level, title: f.title, body: f.body, audience, orgIds,
			emailSent: emailCopy, expiresAt: f.expiresAt,
		});

		// Report what actually went out. It used to say "sent by email" even when
		// every send had failed.
		let emails: { delivered: number; failed: number } | null = null;
		if (emailCopy) {
			emails = await sendAnnouncementEmail(locals.db, targetOrgIds, { level: f.level, title: f.title, body: f.body });
			await recordAnnouncementEmails(locals.db, id, emails.delivered, emails.failed).catch(() => {});
		}
		await logPlatformAction(locals, 'announcement.create', { type: 'announcement', id, label: f.title },
			{ audience, orgs: targetOrgIds.length, emails });

		return { created: true, emails };
	},

	update: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const exists = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM announcements WHERE id = ?', id);
		if (!exists) return fail(404, { error: st(locals.locale).platformMisc.announcementNotFound, editId: id });
		const f = readFields(data, locals.locale);
		if ('error' in f) return fail(400, { error: f.error, editId: id });
		await updateAnnouncement(locals.db, id, f);
		await logPlatformAction(locals, 'announcement.update', { type: 'announcement', id, label: f.title });
		return { updated: true };
	},

	delete: async ({ request, locals }) => {
		requirePlatformAdmin(locals);
		const id = String((await request.formData()).get('id') ?? '');
		if (id) {
			const row = await dbFirst<{ title: string }>(locals.db, 'SELECT title FROM announcements WHERE id = ?', id);
			await dbRun(locals.db, 'DELETE FROM announcements WHERE id = ?', id);
			if (row) await logPlatformAction(locals, 'announcement.delete', { type: 'announcement', id, label: row.title });
		}
		return { deleted: true };
	},
};
