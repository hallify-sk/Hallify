import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import type { HallRow, TableTypeRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { floorplanDraft, recordSavedDraft } from '$lib/server/ai/proposals';
import { layoutVersion } from '$lib/floorplan-layout';
import { syncHallLayouts, writeHallFloorplanOver } from '$lib/server/layout-sync';

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
		draft: draft ? { id: draft.proposalId, stale: draft.stale, state: draft.stale ? null : draft.state } : null,
		// Which stored plan the editor starts from, so a save can tell whether someone
		// else (another tab, a colleague, the assistant) has saved over it since.
		floorplanVersion: await layoutVersion(hall.floorplan_json as string | null),
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
			if (!floorplanJson) floorplanJson = JSON.stringify(draft.state);
			if (!(await writeHallFloorplanOver(locals.db, params.id, orgId, floorplanJson, draft.baseJson))) {
				return fail(409, { error: st(locals.locale).ai.draftStale });
			}
			await recordSavedDraft(locals.db, orgId, proposalId, floorplanJson);
			const sync = await syncHallLayouts(locals.db, params.id, draft.baseJson, floorplanJson, { orgId, actorId: locals.user?.id ?? null });
			return { success: true, draftSaved: true, sync };
		}

		if (!floorplanJson) return fail(400, { error: st(locals.locale).serverErrors.noData });

		// Only over the plan this editor started from. Two tabs (or two people) on the
		// same floor plan used to overwrite each other in silence, last autosave wins;
		// now the later one is told, and chooses to reload or to overwrite.
		const baseVersion = String(data.get('baseVersion') ?? '');
		const force = data.get('force') === '1';
		// The plan being replaced: the hall's templates and events are moved off it.
		const current = await dbFirst<{ floorplan_json: string | null }>(locals.db,
			'SELECT floorplan_json FROM halls WHERE id = ? AND org_id = ?', params.id, orgId);
		if (!current) return fail(404, { error: st(locals.locale).serverErrors.hallNotFound });
		if (baseVersion && !force) {
			const conflict = () => fail(409, { conflict: true, error: st(locals.locale).serverErrors.floorplanChangedElsewhere });
			if ((await layoutVersion(current.floorplan_json)) !== baseVersion) return conflict();
			if (!(await writeHallFloorplanOver(locals.db, params.id, orgId, floorplanJson, current.floorplan_json))) return conflict();
		} else {
			await dbRun(locals.db, 'UPDATE halls SET floorplan_json=? WHERE id=? AND org_id=?', floorplanJson, params.id, orgId);
		}
		// The new room goes under every template and upcoming event; what that leaves
		// wrong is listed for the person who changed it.
		const sync = await syncHallLayouts(locals.db, params.id, current.floorplan_json, floorplanJson, { orgId, actorId: locals.user?.id ?? null });
		return { success: true, version: await layoutVersion(floorplanJson), sync };
	}
};
