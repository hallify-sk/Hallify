import { fail } from '@sveltejs/kit';
import { dbAll, dbRun } from '$lib/db/index';
import { createAnnouncement } from '$lib/announcements';
import type { AnnouncementLevel } from '$lib/announcements';
import { sendAnnouncementEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';

const LEVELS: AnnouncementLevel[] = ['info', 'success', 'warning', 'error'];

export const load: PageServerLoad = async ({ locals }) => {
	const orgs = await dbAll<{ id: string; name: string; slug: string }>(locals.db,
		'SELECT id, name, slug FROM organizations WHERE suspended_at IS NULL ORDER BY name');

	const announcements = await dbAll<{
		id: string; level: string; title: string; body: string; audience: string;
		email_sent: number; created_at: string; target_count: number; read_count: number;
	}>(locals.db, `
		SELECT a.id, a.level, a.title, a.body, a.audience, a.email_sent, a.created_at,
		       CASE WHEN a.audience = 'all'
		            THEN (SELECT COUNT(*) FROM organizations WHERE suspended_at IS NULL)
		            ELSE (SELECT COUNT(*) FROM announcement_targets t WHERE t.announcement_id = a.id) END AS target_count,
		       (SELECT COUNT(*) FROM announcement_reads r WHERE r.announcement_id = a.id) AS read_count
		FROM announcements a ORDER BY a.created_at DESC LIMIT 50`);

	return { orgs, announcements };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const level = String(data.get('level') ?? 'info') as AnnouncementLevel;
		const title = String(data.get('title') ?? '').trim();
		const body = String(data.get('body') ?? '').trim();
		const audience = String(data.get('audience') ?? 'all') === 'specific' ? 'specific' : 'all';
		const orgIds = data.getAll('orgIds').map(String).filter(Boolean);
		const emailCopy = data.get('emailCopy') != null;

		if (!LEVELS.includes(level)) return fail(400, { error: st(locals.locale).serverErrors.invalidLevel });
		if (!title) return fail(400, { error: st(locals.locale).serverErrors.titleRequired });
		if (!body) return fail(400, { error: st(locals.locale).serverErrors.messageRequired });
		if (audience === 'specific' && orgIds.length === 0) return fail(400, { error: st(locals.locale).serverErrors.selectAtLeastOneOrganization });

		const { targetOrgIds } = await createAnnouncement(locals.db, {
			createdBy: locals.user!.id, level, title, body, audience, orgIds, emailSent: emailCopy,
		});

		if (emailCopy) {
			await sendAnnouncementEmail(locals.db, targetOrgIds, { level, title, body });
		}

		return { created: true, emailed: emailCopy };
	},

	delete: async ({ request, locals }) => {
		const id = String((await request.formData()).get('id') ?? '');
		if (id) await dbRun(locals.db, 'DELETE FROM announcements WHERE id = ?', id);
		return { deleted: true };
	},
};
