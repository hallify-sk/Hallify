import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import type { HallRow, TableTypeRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { floorplanDraft, markProposalApplied } from '$lib/server/ai/proposals';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	await requireOrgPermission(locals, 'floorplans.manage');
	const orgId = locals.currentOrg!.id;
	const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', params.id, orgId);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

	const tableTypes = await dbAll<TableTypeRow>(
		locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		params.id
	);

	// ?draft=<proposal>: show an AI assistant's proposed plan here, unsaved, so it can be
	// looked at and adjusted before anything is written.
	const draftId = url.searchParams.get('draft');
	const draft = draftId ? await floorplanDraft(locals.db, orgId, locals.user!.id, draftId, hall.id) : null;

	return {
		hall,
		tableTypes,
		draft: draft ? { id: draft.proposalId, stale: draft.stale, state: draft.stale ? null : draft.state } : null
	};
};

export const actions: Actions = {
	saveFloorplan: async ({ request, params, locals }) => {
		await requireOrgPermission(locals, 'floorplans.manage');
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		let floorplanJson = String(data.get('floorplanJson') ?? '');
		const proposalId = String(data.get('proposalId') ?? '');

		if (proposalId) {
			// Saving an assistant's draft: only while it still applies to the plan it was
			// drawn on, and the proposal is closed with it so it cannot be applied again.
			const draft = await floorplanDraft(locals.db, orgId, locals.user!.id, proposalId, params.id);
			if (!draft || draft.stale) return fail(409, { error: st(locals.locale).ai.draftStale });
			const edited = !!floorplanJson;
			if (!floorplanJson) floorplanJson = JSON.stringify(draft.state);
			const write = await dbRun(locals.db,
				'UPDATE halls SET floorplan_json = ? WHERE id = ? AND org_id = ? AND floorplan_json IS ?',
				floorplanJson, params.id, orgId, draft.baseJson);
			if (write.meta.changes !== 1) return fail(409, { error: st(locals.locale).ai.draftStale });
			await markProposalApplied(locals.db, proposalId, { saved: true, editedInEditor: edited });
			return { success: true, draftSaved: true };
		}

		if (!floorplanJson) return fail(400, { error: st(locals.locale).serverErrors.noData });
		await dbRun(locals.db, 'UPDATE halls SET floorplan_json=? WHERE id=? AND org_id=?', floorplanJson, params.id, orgId);
		return { success: true };
	}
};
