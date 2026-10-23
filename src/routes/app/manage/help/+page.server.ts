import { dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import { articlesFor, searchable, type KbLocale } from '$lib/knowledgebase';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { requireOrgConsole, requireOrgPermission } from '$lib/server/access';
import { st } from '$lib/i18n-server';
import { SETUP_SERVICE_PRICE_CENTS } from '$lib/setup-service';
import { openSetupRequest, createSetupRequest, cancelSetupRequest } from '$lib/server/setup-requests';

export const load: PageServerLoad = async ({ locals }) => {
	await requireOrgConsole(locals);
	const orgId = locals.currentOrg!.id;
	const n = async (sql: string, ...args: unknown[]) =>
		(await dbFirst<{ n: number }>(locals.db, sql, ...args))?.n ?? 0;

	const halls       = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND archived_at IS NULL', orgId);
	const withPlan    = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND floorplan_json IS NOT NULL', orgId);
	const tableTypes  = await n('SELECT COUNT(*) AS n FROM table_types WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	const publicHalls = await n('SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND is_public = 1', orgId);
	const extras      = await n('SELECT COUNT(*) AS n FROM hall_extras WHERE hall_id IN (SELECT id FROM halls WHERE org_id = ?)', orgId);
	const members     = await n('SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?', orgId);
	const firstHall   = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM halls WHERE org_id = ? AND archived_at IS NULL ORDER BY created_at LIMIT 1', orgId);
	const hallHref = firstHall ? `/app/manage/halls/${firstHall.id}` : '/app/manage/halls';

	// Localized — these were hardcoded English literals, so the whole checklist
	// rendered in English even under the Slovak default locale.
	const C = st(locals.locale).membersAdmin.checklistItems;
	// Items an operator has ticked by hand. Some steps are legitimately finished in
	// ways the app cannot observe — a floor plan drawn by us, a team that works from
	// one shared login — and a checklist that can never reach 100% stops being a
	// checklist. Stored per org, keyed by step, so adding or renaming a step later
	// cannot silently mark the wrong one done.
	const manualRow = await dbFirst<{ value: string | null }>(locals.db,
		`SELECT value FROM org_settings WHERE org_id = ? AND key = 'checklist'`, orgId);
	const manual = new Set(
		(fromJson<{ checked?: string[] }>(manualRow?.value ?? null)?.checked ?? [])
			.filter((k): k is string => typeof k === 'string')
	);

	const detected = [
		{ key: 'hall', label: C.hall.label, desc: C.hall.desc, done: halls > 0, href: '/app/manage/halls', cta: C.hall.cta },
		{ key: 'plan', label: C.plan.label, desc: C.plan.desc, done: withPlan > 0, href: hallHref, cta: C.plan.cta },
		{ key: 'tables', label: C.tables.label, desc: C.tables.desc, done: tableTypes > 0, href: hallHref, cta: C.tables.cta },
		{ key: 'public', label: C.public.label, desc: C.public.desc, done: publicHalls > 0, href: hallHref, cta: C.public.cta },
		{ key: 'extras', label: C.extras.label, desc: C.extras.desc, done: extras > 0, href: hallHref, cta: C.extras.cta },
		{ key: 'team', label: C.team.label, desc: C.team.desc, done: members > 1, href: '/app/manage/members/invites', cta: C.team.cta },
	];

	// `auto` is kept separate from `done` so the UI can tell the two apart: a step the
	// app can see is finished should not offer a tick box that does nothing.
	const checklist = detected.map((item) => ({
		...item,
		auto: item.done,
		manual: manual.has(item.key),
		done: item.done || manual.has(item.key)
	}));

	const completed = checklist.filter((c) => c.done).length;

	// An outstanding request, so the card reports its state instead of offering
	// the service to somebody who has already asked for it.
	const setupRequest = await openSetupRequest(locals.db, orgId);

	return {
		checklist,
		completed,
		total: checklist.length,
		setupRequest,
		setupPriceCents: SETUP_SERVICE_PRICE_CENTS,
		// Both languages, so switching language on the page needs no reload, with the
		// plain text the search box matches against.
		articles: Object.fromEntries((['sk', 'en'] as KbLocale[]).map((l) => [l,
			articlesFor(l).map(({ slug, title, category, summary, body }) => ({ slug, title, category, summary, text: searchable(body) }))
		])) as Record<KbLocale, Array<{ slug: string; title: string; category: string; summary: string; text: string }>>,
	};
};

/** The steps that may be ticked by hand. A key from the client is never trusted:
 *  without this, any string could be written into the stored set. */
const CHECKLIST_KEYS = new Set(['hall', 'plan', 'tables', 'public', 'extras', 'team']);

export const actions: Actions = {
	/** Ask us to set the account up. Fixed price, recorded against the org, and
	 *  mailed to us — the organisation's own inbox is the wrong place for it. */
	requestSetup: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		const data = await request.formData();
		// One open request per organisation; also tells us and confirms it to the requester.
		await createSetupRequest(locals, org, String(data.get('note') ?? ''));
		return { setupRequested: true };
	},

	/** Withdraw the setup request while we have not started on it. */
	cancelSetup: async ({ locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		await cancelSetupRequest(locals, org);
		return { setupCancelled: true };
	},

	toggleStep: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		const data = await request.formData();
		const key = String(data.get('key') ?? '');
		if (!CHECKLIST_KEYS.has(key)) return fail(400, { error: 'unknown_step' });

		const row = await dbFirst<{ value: string | null }>(locals.db,
			`SELECT value FROM org_settings WHERE org_id = ? AND key = 'checklist'`, org.id);
		const current = new Set(
			(fromJson<{ checked?: string[] }>(row?.value ?? null)?.checked ?? [])
				.filter((k): k is string => typeof k === 'string' && CHECKLIST_KEYS.has(k))
		);

		if (current.has(key)) current.delete(key);
		else current.add(key);

		await dbRun(locals.db,
			`INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
			 VALUES (?, 'checklist', ?, datetime('now'))`,
			org.id, toJson({ checked: [...current] }));

		return { checklistSaved: true };
	}
};
