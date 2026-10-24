import { dbFirst, dbRun, fromJson, toJson, wroteRow } from '$lib/db/index';
import { createReservation } from '$lib/server/reservations';
import { getPlan } from '$lib/plans';
import { memberCan, loadSeating, layoutHash } from './tools';
import { migrateToMultiFloor, type WallObj, type ZoneObj, type BoundsRect } from '$lib/floorplan-types';
import type { Guest } from '$lib/floorplan-types';
import { loadHallProfile, currentValue, validateHallPatch, applyHallPatch, type HallField } from '$lib/server/hall-profile';
import type { OrgContext } from '../../../app.d';
import { applyChanges, type CheckedOp } from './operations';
import { refreshLayoutProblems, syncHallLayouts, writeHallFloorplanOver } from '$lib/server/layout-sync';

/**
 * Applying what the assistant proposed.
 *
 * Apply runs the stored payload — exactly what the person saw in the preview — and
 * through the same functions the rest of the app uses, so every rule is checked
 * again at the moment of writing. A date taken between the preview and the click
 * fails that row; it is not written over.
 */

export interface ImportRow {
	line: number;
	title: string;
	event_date: string | null;
	start_time: string | null;
	end_time: string | null;
	num_guests: number | null;
	hall_id: string | null;
	hall_name: string | null;
	description: string | null;
	error: string | null;
}

export interface ProposalRow {
	id: string;
	kind: string;
	status: 'pending' | 'applied' | 'discarded';
	payload: string;
	result: string | null;
	user_id: string;
}

export interface SeatingPayload {
	reservationId: string;
	title: string;
	baseHash: string;
	keepExisting: boolean;
	newGuests: Guest[];
	tables: { floorId: string; id: string; label: string; assignments: (string | null)[] }[];
	names: Record<string, string>;
	unseated: string[];
	split?: string[];
}

export type ApplyOutcome =
	| { ok: true; created: number; failed: { line: number; title: string; error: string }[] }
	| { ok: true; seated: number; reservationId: string }
	| { ok: true; updated: string[]; hallId: string }
	| { ok: true; floorplan: true; hallId: string }
	| { ok: true; results: { ok: boolean; error?: string; skipped?: boolean }[] }
	| { ok: false; status: number; error: string };

export async function loadProposal(db: App.Locals['db'], orgId: string, id: string): Promise<ProposalRow | null> {
	return dbFirst<ProposalRow>(db,
		'SELECT id, kind, status, payload, result, user_id FROM ai_proposals WHERE id = ? AND org_id = ?', id, orgId);
}

export async function applyProposal(
	locals: App.Locals,
	org: OrgContext,
	id: string,
	/** For a batch of changes: the positions the person unticked, left out of this apply. */
	opts: { skip?: number[] } = {}
): Promise<ApplyOutcome> {
	const p = await loadProposal(locals.db, org.id, id);
	if (!p) return { ok: false, status: 404, error: 'not_found' };
	// Only the person it was proposed to; a colleague sees their own conversations.
	if (p.user_id !== locals.user!.id) return { ok: false, status: 403, error: 'forbidden' };

	// Claimed before any work, so a double click cannot import the file twice.
	const claim = await dbRun(locals.db,
		"UPDATE ai_proposals SET status = 'applied', resolved_at = datetime('now') WHERE id = ? AND status = 'pending'", id);
	if (!wroteRow(claim)) return { ok: false, status: 409, error: 'already_resolved' };

	if (p.kind === 'reservation_import') {
		if (!(await memberCan(locals, 'reservations.manage'))) {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'pending', resolved_at = NULL WHERE id = ?", id);
			return { ok: false, status: 403, error: 'forbidden' };
		}
		const { rows } = fromJson<{ rows: ImportRow[] }>(p.payload) ?? { rows: [] };
		let created = 0;
		const failed: { line: number; title: string; error: string }[] = [];
		for (const r of rows) {
			if (r.error || !r.hall_id || !r.event_date) continue;
			const res = await createReservation(locals, {
				orgId: org.id,
				hallId: r.hall_id,
				title: r.title,
				eventDate: r.event_date,
				startTime: r.start_time,
				endTime: r.end_time,
				numGuests: r.num_guests,
				description: r.description,
				silent: true
			});
			if (res.ok) created++;
			else failed.push({ line: r.line, title: r.title, error: res.error });
		}
		await dbRun(locals.db, 'UPDATE ai_proposals SET result = ? WHERE id = ?', toJson({ created, failed }), id);
		return { ok: true, created, failed };
	}

	if (p.kind === 'seating') {
		if (!(await memberCan(locals, 'reservations.manage'))) {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'pending', resolved_at = NULL WHERE id = ?", id);
			return { ok: false, status: 403, error: 'forbidden' };
		}
		// Edited since the preview (or gone): the plan was made for a layout that no
		// longer exists, so it is withdrawn rather than written over someone's work.
		const stale = async () => {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'discarded', result = ? WHERE id = ?", toJson({ stale: true }), id);
			return { ok: false as const, status: 409, error: 'layout_changed' };
		};
		const built = await seatingFromPlan(locals, org, fromJson<SeatingPayload>(p.payload));
		if (!built) return stale();
		const write = await dbRun(locals.db,
			'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ? AND layout_json IS ?',
			JSON.stringify(built.layout), built.reservationId, org.id, built.baseJson);
		if (!wroteRow(write)) return stale();
		await refreshLayoutProblems(locals.db, 'event', built.reservationId);
		await dbRun(locals.db, 'UPDATE ai_proposals SET result = ? WHERE id = ?', toJson({ seated: built.seated }), id);
		return { ok: true, seated: built.seated, reservationId: built.reservationId };
	}

	if (p.kind === 'changes') {
		// Each operation re-checks its own permission and runs through the shared
		// functions; one failing does not undo or stop the others, and each is reported.
		const ops = fromJson<{ ops: CheckedOp[] }>(p.payload)?.ops ?? [];
		const skip = new Set((opts.skip ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < ops.length));
		if (ops.length && skip.size === ops.length) {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'pending', resolved_at = NULL WHERE id = ?", id);
			return { ok: false, status: 400, error: 'nothing_selected' };
		}
		const ran = await applyChanges({ locals, org, can: (perm) => memberCan(locals, perm) }, ops.filter((_, i) => !skip.has(i)));
		let k = 0;
		const results = ops.map((_, i) => (skip.has(i) ? { ok: false, skipped: true } : ran[k++]));
		await dbRun(locals.db, 'UPDATE ai_proposals SET result = ? WHERE id = ?', toJson({ results }), id);
		return { ok: true, results };
	}

	if (p.kind === 'floorplan') {
		if (!(await memberCan(locals, 'floorplans.manage'))) {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'pending', resolved_at = NULL WHERE id = ?", id);
			return { ok: false, status: 403, error: 'forbidden' };
		}
		const plan = fromJson<{ hallId: string; baseHash: string; walls: WallObj[]; zones: ZoneObj[]; bounds: BoundsRect }>(p.payload);
		const hall = plan ? await dbFirst<{ id: string; floorplan_json: string | null }>(locals.db,
			'SELECT id, floorplan_json FROM halls WHERE id = ? AND org_id = ?', plan.hallId, org.id) : null;
		const stale = async () => {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'discarded', result = ? WHERE id = ?", toJson({ stale: true }), id);
			return { ok: false as const, status: 409, error: 'floorplan_changed' };
		};
		if (!plan || !hall || (await layoutHash(hall.floorplan_json)) !== plan.baseHash) return stale();

		// Walls, zones and the outline of the first floor are replaced; tables and
		// seats already placed, and any other floors, are kept as they are.
		const state = migrateToMultiFloor(hall.floorplan_json);
		const floor = state.floors[0];
		floor.walls = plan.walls;
		floor.zones = plan.zones;
		floor.bounds = plan.bounds;
		delete floor.boundsParts;   // the proposal's outline is one rectangle
		if (!(await writeHallFloorplanOver(locals.db, hall.id, org.id, JSON.stringify(state), hall.floorplan_json))) return stale();
		// The new room goes under the hall's templates and upcoming events too.
		await syncHallLayouts(locals.db, hall.id, hall.floorplan_json, JSON.stringify(state), { orgId: org.id, actorId: locals.user?.id ?? null });
		await dbRun(locals.db, 'UPDATE ai_proposals SET result = ? WHERE id = ?', toJson({ saved: true }), id);
		return { ok: true, floorplan: true, hallId: hall.id };
	}

	if (p.kind === 'hall_update') {
		if (!(await memberCan(locals, 'halls.manage'))) {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'pending', resolved_at = NULL WHERE id = ?", id);
			return { ok: false, status: 403, error: 'forbidden' };
		}
		const plan = fromJson<{ hallId: string; before: Record<string, unknown>; after: Record<string, unknown> }>(p.payload);
		const hall = plan ? await loadHallProfile(locals.db, org.id, plan.hallId) : null;
		const stale = async () => {
			await dbRun(locals.db, "UPDATE ai_proposals SET status = 'discarded', result = ? WHERE id = ?", toJson({ stale: true }), id);
			return { ok: false as const, status: 409, error: 'hall_changed' };
		};
		if (!plan || !hall) return stale();
		// Someone edited one of these fields after the preview: theirs stands.
		for (const [field, was] of Object.entries(plan.before)) {
			if (JSON.stringify(currentValue(hall, field as HallField)) !== JSON.stringify(was)) return stale();
		}
		// Validated again at the moment of writing, by the same rules as the form.
		const checked = await validateHallPatch(locals.db, org.id, {
			...plan.after,
			opening_hours: plan.after.opening_hours
				? Object.entries(plan.after.opening_hours as Record<string, object>).map(([day, h]) => ({ day, ...h }))
				: undefined
		}, { maxGallery: getPlan(org.subscription.plan).limits.maxGalleryImages });
		if (!checked.ok) return stale();
		await applyHallPatch(locals.db, org.id, hall, checked.patch);
		const updated = Object.keys(checked.patch);
		await dbRun(locals.db, 'UPDATE ai_proposals SET result = ? WHERE id = ?', toJson({ updated }), id);
		return { ok: true, updated, hallId: hall.id };
	}

	return { ok: false, status: 400, error: 'unknown_kind' };
}

/**
 * The event's seating with a seating plan applied — not written. Null when the plan
 * no longer fits: the seating was edited since (fingerprint), or the tables changed
 * (with no saved seating the base is the hall's plan, which the fingerprint misses).
 */
export async function seatingFromPlan(locals: App.Locals, org: OrgContext, plan: SeatingPayload | null) {
	if (!plan) return null;
	const loaded = await loadSeating({ locals, org }, plan.reservationId);
	if ('error' in loaded || loaded.baseHash !== plan.baseHash) return null;
	const { layout, reservation } = loaded;
	const have = new Set(layout.guests.map((g) => g.id));
	for (const g of plan.newGuests) if (!have.has(g.id)) layout.guests.push(g);
	for (const pt of plan.tables) {
		const t = layout.floors.find((f) => f.id === pt.floorId)?.tables.find((x) => x.id === pt.id);
		const now = loaded.tables.find((x) => x.id === pt.id);
		if (!t || !now || now.assignments.length !== pt.assignments.length) return null;
		t.assignments = pt.assignments;
	}
	const seated = plan.tables.reduce((n, t) => n + t.assignments.filter(Boolean).length, 0);
	return { layout, reservationId: reservation.id, baseJson: reservation.layout_json, seated };
}

/** A pending seating proposal for this event, as the seating editor shows it. */
export async function seatingDraft(locals: App.Locals, org: OrgContext, proposalId: string, reservationId: string) {
	const p = await loadProposal(locals.db, org.id, proposalId);
	if (!p || p.kind !== 'seating' || p.user_id !== locals.user!.id) return null;
	const plan = fromJson<SeatingPayload>(p.payload);
	if (!plan || plan.reservationId !== reservationId) return null;
	const built = p.status === 'pending' ? await seatingFromPlan(locals, org, plan) : null;
	return { proposalId: p.id, stale: !built, built };
}

/**
 * A floor-plan proposal as the editor should show it: the hall's current plan with
 * the proposed walls, zones and outline in place of its own — exactly what Apply
 * would write. `stale` when the plan changed since the proposal was made.
 */
export async function floorplanDraft(db: App.Locals['db'], orgId: string, userId: string, proposalId: string, hallId: string) {
	const p = await loadProposal(db, orgId, proposalId);
	if (!p || p.kind !== 'floorplan' || p.user_id !== userId) return null;
	const plan = fromJson<{ hallId: string; baseHash: string; walls: WallObj[]; zones: ZoneObj[]; bounds: BoundsRect }>(p.payload);
	if (!plan || plan.hallId !== hallId) return null;
	const hall = await dbFirst<{ floorplan_json: string | null }>(db, 'SELECT floorplan_json FROM halls WHERE id = ? AND org_id = ?', hallId, orgId);
	if (!hall) return null;
	const state = migrateToMultiFloor(hall.floorplan_json);
	state.floors[0].walls = plan.walls;
	state.floors[0].zones = plan.zones;
	state.floors[0].bounds = plan.bounds;
	delete state.floors[0].boundsParts;
	const stale = p.status !== 'pending' || (await layoutHash(hall.floorplan_json)) !== plan.baseHash;
	return { proposalId: p.id, state, stale, baseJson: hall.floorplan_json };
}

/**
 * What saving a draft from the editor actually saved, measured on the saved JSON —
 * never taken from the proposal's own numbers. `saved: false` when the saved plan
 * holds none of the proposal (the editor wrote back the plan it had before the draft
 * was shown), so a card can never claim "23 seated" over a layout nobody sits in.
 */
export function savedDraftOutcome(kind: string, payload: unknown, savedJson: string):
	| { saved: false }
	| { saved: true; result: Record<string, unknown> } {
	const saved = migrateToMultiFloor(savedJson);
	if (kind === 'seating') {
		const plan = payload as SeatingPayload | null;
		if (!plan) return { saved: false };
		const tableOf = new Map<string, string>();
		for (const f of saved.floors) for (const t of f.tables) for (const g of t.assignments ?? []) if (g) tableOf.set(g, t.id);
		const placements = plan.tables.flatMap((t) => t.assignments.filter((g): g is string => !!g).map((g) => [g, t.id] as const));
		const asPlanned = placements.filter(([g, t]) => tableOf.get(g) === t).length;
		const listed = new Set(saved.guests.map((g) => g.id));
		const newKept = plan.newGuests.filter((g) => listed.has(g.id)).length;
		if (placements.length && (asPlanned === 0 || (plan.newGuests.length > 0 && newKept === 0))) return { saved: false };
		return {
			saved: true,
			result: {
				seated: placements.filter(([g]) => tableOf.has(g)).length,
				editedInEditor: asPlanned < placements.length,
				savedFromEditor: true
			}
		};
	}
	if (kind === 'floorplan') {
		const plan = payload as { walls?: WallObj[]; zones?: ZoneObj[] } | null;
		if (!plan) return { saved: false };
		const ids = [...(plan.walls ?? []), ...(plan.zones ?? [])].map((x) => x.id);
		const have = new Set(saved.floors.flatMap((f) => [...f.walls, ...f.zones].map((x) => x.id)));
		if (ids.length && !ids.some((id) => have.has(id))) return { saved: false };
		const first = saved.floors[0];
		const same = !!first && JSON.stringify(first.walls) === JSON.stringify(plan.walls ?? [])
			&& JSON.stringify(first.zones) === JSON.stringify(plan.zones ?? []);
		return { saved: true, result: { saved: true, editedInEditor: !same } };
	}
	return { saved: true, result: { saved: true } };
}

/**
 * Close a proposal whose draft was saved from the editor, recording what was really
 * saved (see savedDraftOutcome). A save that carried none of it withdraws the
 * proposal as stale instead: the saved plan replaced the one it was made for.
 */
export async function recordSavedDraft(db: App.Locals['db'], orgId: string, id: string, savedJson: string): Promise<'applied' | 'not_saved' | null> {
	const p = await loadProposal(db, orgId, id);
	if (!p || p.status !== 'pending') return null;
	const outcome = savedDraftOutcome(p.kind, fromJson(p.payload), savedJson);
	if (!outcome.saved) {
		await dbRun(db,
			"UPDATE ai_proposals SET status = 'discarded', resolved_at = datetime('now'), result = ? WHERE id = ? AND status = 'pending'",
			toJson({ stale: true, notSaved: true }), id);
		return 'not_saved';
	}
	return (await markProposalApplied(db, id, outcome.result)) ? 'applied' : null;
}

/** Close a proposal that was saved some other way than Apply. Callers that saved
 *  from the editor use recordSavedDraft, which measures what was saved. */
export async function markProposalApplied(db: App.Locals['db'], id: string, result: unknown): Promise<boolean> {
	const r = await dbRun(db,
		"UPDATE ai_proposals SET status = 'applied', resolved_at = datetime('now'), result = ? WHERE id = ? AND status = 'pending'",
		toJson(result), id);
	return wroteRow(r);
}

export async function discardProposal(locals: App.Locals, org: OrgContext, id: string): Promise<boolean> {
	const res = await dbRun(locals.db,
		`UPDATE ai_proposals SET status = 'discarded', resolved_at = datetime('now')
		  WHERE id = ? AND org_id = ? AND user_id = ? AND status = 'pending'`,
		id, org.id, locals.user!.id);
	return wroteRow(res);
}
