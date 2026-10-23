/**
 * Applying a hall's floor plan to its templates and upcoming events, and storing
 * what that leaves wrong. See src/lib/floorplan-sync.ts for the rules.
 *
 * Every write of a hall's plan goes through `syncHallLayouts`; every write of a
 * template's or an event's layout stores its problems with it (`problemsColumn`),
 * or calls `refreshLayoutProblems` afterwards, so the flag clears when a layout is
 * fixed and saved.
 */
import type { D1Database } from '@cloudflare/workers-types';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import {
	applyHallGeometry, followsHallPlan, hasLayout, layoutProblems, parseProblems, problemsColumn, roomKey,
	UPCOMING_STATUSES, type HallSyncReport, type LayoutProblem
} from '$lib/floorplan-sync';
import { notifyLayoutProblems } from '$lib/server/notification-centre';

interface TemplateSyncRow { id: string; name: string; layout_json: string | null; layout_problems: string | null }
interface EventSyncRow {
	id: string; title: string; status: string; event_date: string; start_time: string | null;
	layout_json: string | null; layout_problems: string | null;
}

const IN_STATUSES = UPCOMING_STATUSES.map(() => '?').join(', ');
/** D1 caps a batch; stay well under it. */
const BATCH = 50;

/**
 * Lay the hall's new plan under every template of the hall and every upcoming
 * event's own layout (an event without one shows the hall's plan as it is), keep
 * their furniture, and store what is now wrong with each. Returns the templates
 * and events that have problems now, whatever caused them.
 */
export async function syncHallLayouts(
	db: D1Database, hallId: string, previousJson: string | null, nextJson: string,
	/** Who saved the plan, to tell the rest of the team in the notification centre
	 *  (D12) when this save made a template or an event worse. */
	notify?: { orgId: string; actorId: string | null }
): Promise<HallSyncReport> {
	// The hall's plan is saved by now; a failure here must not turn that save into an
	// error (the layouts follow at the next save, or when they are next opened).
	let report: HallSyncReport, worse: boolean;
	try {
		({ report, worse } = await syncAll(db, hallId, previousJson, nextJson));
	} catch (e) {
		console.error('layout-sync: hall', hallId, e);
		return { templates: [], events: [], failed: true };
	}
	// Only when the save added problems: autosaves of a plan that still leaves the same
	// tables in a wall would otherwise ring everyone's bell again and again.
	if (notify && worse) {
		const hall = await dbFirst<{ name: string }>(db, 'SELECT name FROM halls WHERE id = ? AND org_id = ?', hallId, notify.orgId).catch(() => null);
		if (hall) {
			await notifyLayoutProblems(db, {
				orgId: notify.orgId, hallId, hall: hall.name, actorId: notify.actorId,
				templates: report.templates.length, events: report.events.length,
			});
		}
	}
	return report;
}

async function syncAll(db: D1Database, hallId: string, previousJson: string | null, nextJson: string): Promise<{ report: HallSyncReport; worse: boolean }> {
	const templates = await dbAll<TemplateSyncRow>(db,
		'SELECT id, name, layout_json, layout_problems FROM floorplan_templates WHERE hall_id = ? ORDER BY name',
		hallId);
	// A day back: whether an event of today has begun is decided per row below.
	const events = (await dbAll<EventSyncRow>(db,
		`SELECT id, title, status, event_date, start_time, layout_json, layout_problems FROM reservations
		 WHERE hall_id = ? AND status IN (${IN_STATUSES}) AND event_date >= date('now', '-1 day')
		 ORDER BY event_date, start_time`,
		hallId, ...UPCOMING_STATUSES)).filter((e) => followsHallPlan(e));

	const writes: ReturnType<D1Database['prepare']>[] = [];
	const report: HallSyncReport = { templates: [], events: [] };
	// Whether any layout has more problems than it had before this save.
	let worse = false;

	for (const tm of templates) {
		if (!hasLayout(tm.layout_json)) continue;
		const { json, column, problems } = synced(tm.layout_json, nextJson, previousJson);
		if (json !== tm.layout_json || column !== tm.layout_problems) {
			// Only over the layout read here: a save in between wins, and lays the
			// hall's plan under itself on the way in.
			writes.push(db.prepare('UPDATE floorplan_templates SET layout_json = ?, layout_problems = ? WHERE id = ? AND layout_json IS ?')
				.bind(json, column, tm.id, tm.layout_json));
		}
		if (problems.length > parseProblems(tm.layout_problems).length) worse = true;
		if (problems.length) report.templates.push({ id: tm.id, name: tm.name, problems: problems.length });
	}
	for (const ev of events) {
		if (!hasLayout(ev.layout_json)) {
			if (ev.layout_problems) writes.push(db.prepare('UPDATE reservations SET layout_problems = NULL WHERE id = ?').bind(ev.id));
			continue;
		}
		const { json, column, problems } = synced(ev.layout_json, nextJson, previousJson);
		if (json !== ev.layout_json || column !== ev.layout_problems) {
			writes.push(db.prepare('UPDATE reservations SET layout_json = ?, layout_problems = ? WHERE id = ? AND layout_json IS ?')
				.bind(json, column, ev.id, ev.layout_json));
		}
		if (problems.length > parseProblems(ev.layout_problems).length) worse = true;
		if (problems.length) report.events.push({ id: ev.id, title: ev.title, event_date: ev.event_date, problems: problems.length });
	}

	for (let i = 0; i < writes.length; i += BATCH) await db.batch(writes.slice(i, i + BATCH));
	return { report, worse };
}

function synced(layoutJson: string | null, hallJson: string, previousJson: string | null) {
	const state = applyHallGeometry(layoutJson, hallJson, previousJson);
	const problems = layoutProblems(state, hallJson);
	return { json: JSON.stringify(state), column: problemsColumn(problems), problems };
}

/**
 * A template's or an event's layout about to be saved, on the hall's current
 * room, with its problems. `follow` false (a past or cancelled event) keeps the
 * layout's own room and only measures it.
 */
export function prepareLayoutSave(layoutJson: string, hallJson: string | null, follow = true): {
	json: string; problems: LayoutProblem[]; column: string | null; roomChanged: boolean;
} {
	try {
		const v = JSON.parse(layoutJson);
		if (!v || typeof v !== 'object') throw new Error('not a layout');
	} catch {
		// Not a layout at all: stored as sent, as before, and measured as nothing.
		return { json: layoutJson, problems: [], column: null, roomChanged: false };
	}
	if (!hallJson || !follow) {
		const problems = hallJson && follow ? layoutProblems(layoutJson, hallJson) : [];
		return { json: layoutJson, problems, column: problemsColumn(problems), roomChanged: false };
	}
	const state = applyHallGeometry(layoutJson, hallJson);
	const json = JSON.stringify(state);
	const problems = layoutProblems(state, hallJson);
	// Whether laying the hall's room under it changed anything but furniture: the
	// editor was opened on an older room, and is rebuilt on this one.
	return { json, problems, column: problemsColumn(problems), roomChanged: roomKey(layoutJson) !== roomKey(state) };
}

/**
 * Recompute and store the problems of one template or event from what is stored,
 * after a write that did not go through `prepareLayoutSave` (a reset to the hall's
 * plan, a template applied from the event page, an assistant's seating).
 */
export async function refreshLayoutProblems(db: D1Database, kind: 'template' | 'event', id: string): Promise<LayoutProblem[]> {
	// The layout is written by now; a failure here must not fail that write.
	try {
		return await refresh(db, kind, id);
	} catch (e) {
		console.error('layout-sync: refresh', kind, id, e);
		return [];
	}
}

async function refresh(db: D1Database, kind: 'template' | 'event', id: string): Promise<LayoutProblem[]> {
	const row = kind === 'template'
		? await dbFirst<{ layout_json: string | null; hall_json: string | null; status?: string; event_date?: string; start_time?: string | null }>(db,
			`SELECT ft.layout_json, h.floorplan_json AS hall_json FROM floorplan_templates ft
			 JOIN halls h ON h.id = ft.hall_id WHERE ft.id = ?`, id)
		: await dbFirst<{ layout_json: string | null; hall_json: string | null; status?: string; event_date?: string; start_time?: string | null }>(db,
			`SELECT r.layout_json, r.status, r.event_date, r.start_time, h.floorplan_json AS hall_json FROM reservations r
			 JOIN halls h ON h.id = r.hall_id WHERE r.id = ?`, id);
	if (!row) return [];
	const measured = kind === 'template' || followsHallPlan({ status: row.status ?? '', event_date: row.event_date ?? '', start_time: row.start_time });
	const problems = measured && row.hall_json && hasLayout(row.layout_json) ? layoutProblems(row.layout_json, row.hall_json) : [];
	await dbRun(db, `UPDATE ${kind === 'template' ? 'floorplan_templates' : 'reservations'} SET layout_problems = ? WHERE id = ?`,
		problemsColumn(problems), id);
	return problems;
}
