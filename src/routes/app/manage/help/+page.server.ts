import { dbFirst } from '$lib/db/index';
import { ARTICLES } from '$lib/knowledgebase';
import type { PageServerLoad } from './$types';
import { st } from '$lib/i18n-server';

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

	// Localized — these were hardcoded English literals, so the whole checklist
	// rendered in English even under the Slovak default locale.
	const C = st(locals.locale).membersAdmin.checklistItems;
	const checklist = [
		{ key: 'hall', label: C.hall.label, desc: C.hall.desc, done: halls > 0, href: '/app/manage/halls', cta: C.hall.cta },
		{ key: 'plan', label: C.plan.label, desc: C.plan.desc, done: withPlan > 0, href: hallHref, cta: C.plan.cta },
		{ key: 'tables', label: C.tables.label, desc: C.tables.desc, done: tableTypes > 0, href: hallHref, cta: C.tables.cta },
		{ key: 'public', label: C.public.label, desc: C.public.desc, done: publicHalls > 0, href: hallHref, cta: C.public.cta },
		{ key: 'extras', label: C.extras.label, desc: C.extras.desc, done: extras > 0, href: hallHref, cta: C.extras.cta },
		{ key: 'team', label: C.team.label, desc: C.team.desc, done: members > 1, href: '/app/manage/members', cta: C.team.cta },
	];

	const completed = checklist.filter((c) => c.done).length;

	return {
		checklist,
		completed,
		total: checklist.length,
		articles: ARTICLES.map(({ slug, title, category, summary }) => ({ slug, title, category, summary })),
	};
};
