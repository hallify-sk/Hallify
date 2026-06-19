import { dbFirst } from '$lib/db/index';
import { ARTICLES } from '$lib/knowledgebase';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const orgId = locals.currentOrg!.id;
	const n = async (sql: string, ...args: unknown[]) =>
		(await dbFirst<{ n: number }>(locals.db, sql, ...args))?.n ?? 0;

	const halls       = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ?', orgId);
	const withPlan    = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND floorplan_json IS NOT NULL', orgId);
	const tableTypes  = await n('SELECT COUNT(*) AS n FROM table_types WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	const publicHalls = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND is_public = 1', orgId);
	const extras      = await n('SELECT COUNT(*) AS n FROM hall_extras WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	const members     = await n('SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?', orgId);
	const firstHall   = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM halls WHERE org_id = ? ORDER BY created_at LIMIT 1', orgId);
	const hallHref = firstHall ? `/app/manage/halls/${firstHall.id}` : '/app/manage/halls';

	const checklist = [
		{ key: 'hall',    label: 'Create your first hall',  desc: 'Add a space you rent out — capacity, address, photos.', done: halls > 0,       href: '/app/manage/halls', cta: 'Add a hall' },
		{ key: 'plan',    label: 'Draw a floor plan',       desc: 'Set the room bounds, walls and zones so you can seat guests.', done: withPlan > 0, href: hallHref, cta: 'Open a hall' },
		{ key: 'tables',  label: 'Define table types',      desc: 'Reusable tables (a round 8-seater, a banquet table…) you place per event.', done: tableTypes > 0, href: hallHref, cta: 'Add table types' },
		{ key: 'public',  label: 'Publish a hall',          desc: 'Make a hall public so guests can find and request it.', done: publicHalls > 0, href: hallHref, cta: 'Publish' },
		{ key: 'extras',  label: 'Offer extras (optional)', desc: 'Let guests order catering, equipment or services with a booking.', done: extras > 0, href: hallHref, cta: 'Add extras' },
		{ key: 'team',    label: 'Invite a teammate',       desc: 'Bring colleagues in to help manage events.', done: members > 1, href: '/app/manage/members', cta: 'Invite' },
	];

	const completed = checklist.filter((c) => c.done).length;

	return {
		checklist,
		completed,
		total: checklist.length,
		articles: ARTICLES.map(({ slug, title, category, summary }) => ({ slug, title, category, summary })),
	};
};
