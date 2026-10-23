/**
 * Keeping templates and event layouts in step with their hall's floor plan.
 *
 * A template or an event layout is a copy of the hall's plan with furniture on it.
 * When the hall's plan changes (the room's shape, a wall, a pillar, the hall's own
 * zones, its floors), the copies used to keep the old room for ever. Now the new
 * room is laid under every template and upcoming event, their own tables, chairs,
 * guests and event zones kept, and each is checked: a table or chair that now
 * stands in a wall or a pillar, off the floor, or on a floor the hall no longer has
 * is a problem the venue has to look at.
 *
 * Pure, so the server (which applies and stores it) and the editors (which show it
 * live while the problems are being fixed) agree, and it is tested directly.
 */

import { migrateToMultiFloor, type FloorData, type MultiFloorState } from './floorplan-types';
import {
	hitboxHitsWall, hitboxInRoom, roomOutline, roomParts, seatHitbox, tableHitbox, withRoom
} from './floorplan-geometry';
import { tableNumbers, tableTag } from './floorplan-layout';
import { hasEventStarted } from './reservationStatus';

/** What is wrong with one table or chair. */
export type LayoutProblemKind = 'wall' | 'outside' | 'floor';

export interface LayoutProblem {
	/** The table's or the standalone chair's id. */
	id: string;
	item: 'table' | 'chair';
	kind: LayoutProblemKind;
	/** "T3" for a table, null for a standalone chair. */
	tag: string | null;
	/** The name of the floor it stands on, as stored. */
	floor: string;
}

/** What a change of a hall's plan left wrong, for the list shown after saving it. */
export interface HallSyncReport {
	templates: { id: string; name: string; problems: number }[];
	events: { id: string; title: string; event_date: string; problems: number }[];
	/** The plan was saved, but its templates and events could not be updated. */
	failed?: boolean;
}

function clone(raw: unknown): unknown {
	if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
	return raw == null ? raw : JSON.parse(JSON.stringify(raw));
}

/** A stored layout that has furniture or a room of its own (not an empty column). */
export function hasLayout(raw: unknown): boolean {
	const v = clone(raw) as Record<string, unknown> | null;
	if (!v || typeof v !== 'object') return false;
	return Array.isArray(v.floors) ? v.floors.length > 0 : !!(v.tables || v.walls || v.zones);
}

/**
 * Which hall floor each of a layout's floors is: its index in `hallFloors`, or -1
 * for a floor the hall no longer has. Floors are matched by id. A layout with no
 * id in common with the hall is matched by position instead: plans stored before
 * floors had lasting ids get a new random one each time they are read, so their
 * ids never match, and a layout whose every floor was really removed from the hall
 * is far rarer than one of those.
 */
export function matchFloors(layoutFloors: { id: string }[], hallFloors: { id: string }[]): number[] {
	const byId = new Map(hallFloors.map((f, i) => [f.id, i]));
	let out = layoutFloors.map((f) => byId.get(f.id) ?? -1);
	if (out.every((i) => i === -1)) out = layoutFloors.map((_, i) => (i < hallFloors.length ? i : -1));
	// One layout floor per hall floor: a repeated id is the first one's duplicate.
	const taken = new Set<number>();
	return out.map((i) => {
		if (i < 0 || taken.has(i)) return -1;
		taken.add(i);
		return i;
	});
}

function zoneIds(state: MultiFloorState): string[] {
	return state.floors.flatMap((f) => (f.zones ?? []).map((z) => z.id));
}

/**
 * The layout on the hall's current room: every hall floor in the hall's order,
 * with the hall's walls, pillars, outline and zones, and the layout's own tables,
 * chairs and event zones on it. A floor the hall added comes empty; a floor the
 * hall removed stays (at the end) while it still has furniture on it, so nothing
 * is lost and the problem can be seen, and goes once it is empty.
 *
 * A zone is the hall's when its id is on the hall's plan — the current one, or
 * `previousHall`, the plan before this change, so a zone the hall removed goes
 * from the layouts too.
 */
export function applyHallGeometry(layoutRaw: unknown, hallRaw: unknown, previousHall?: unknown): MultiFloorState {
	const layout = migrateToMultiFloor(clone(layoutRaw));
	const hall = migrateToMultiFloor(clone(hallRaw));
	const hallZones = new Set([...zoneIds(hall), ...(previousHall ? zoneIds(migrateToMultiFloor(clone(previousHall))) : [])]);
	const match = matchFloors(layout.floors, hall.floors);
	const byHall = new Map<number, FloorData>();
	match.forEach((h, li) => { if (h >= 0) byHall.set(h, layout.floors[li]); });

	const floors: FloorData[] = hall.floors.map((hf, hi) => {
		const lf = byHall.get(hi);
		const own = (lf?.zones ?? []).filter((z) => !hallZones.has(z.id));
		const floor: FloorData = {
			...(lf ?? {}),
			id: hf.id,
			name: hf.name,
			walls: clone(hf.walls ?? []) as FloorData['walls'],
			zones: [...(clone(hf.zones ?? []) as FloorData['zones']), ...own],
			tables: lf?.tables ?? [],
			seats: lf?.seats ?? [],
			bounds: null
		};
		return withRoom(floor, roomParts(hf));
	});
	layout.floors.forEach((lf, li) => {
		if (match[li] < 0 && ((lf.tables ?? []).length || (lf.seats ?? []).length)) floors.push(lf);
	});
	return { ...layout, version: 2, floors, guests: layout.guests ?? [] };
}

/**
 * Tables and chairs that stand in a wall or a pillar, off the room's floor, or on
 * a floor the hall no longer has, measured against the hall's plan. Overlaps
 * between tables are not counted: the hall's plan does not cause them, and the
 * editor shows them anyway.
 */
export function layoutProblems(layoutRaw: unknown, hallRaw: unknown): LayoutProblem[] {
	const layout = migrateToMultiFloor(clone(layoutRaw));
	const hall = migrateToMultiFloor(clone(hallRaw));
	const match = matchFloors(layout.floors, hall.floors);
	const nums = tableNumbers(layout.floors);
	const out: LayoutProblem[] = [];
	layout.floors.forEach((lf, li) => {
		const hf = match[li] >= 0 ? hall.floors[match[li]] : null;
		const parts = hf ? roomParts(hf) : [];
		const outline = roomOutline(parts);
		const walls = hf?.walls ?? [];
		const check = (hb: ReturnType<typeof tableHitbox>): LayoutProblemKind | null => {
			if (!hf) return 'floor';
			if (walls.some((w) => hitboxHitsWall(hb, w))) return 'wall';
			if (!hitboxInRoom(hb, parts, outline)) return 'outside';
			return null;
		};
		for (const t of lf.tables ?? []) {
			const kind = check(tableHitbox(t));
			if (kind) out.push({ id: t.id, item: 'table', kind, tag: tableTag(nums.get(t.id)), floor: lf.name ?? '' });
		}
		for (const s of lf.seats ?? []) {
			const kind = check(seatHitbox(s));
			if (kind) out.push({ id: s.id, item: 'chair', kind, tag: null, floor: lf.name ?? '' });
		}
	});
	return out;
}

const r3 = (v: unknown) => Math.round((Number(v) || 0) * 1000) / 1000;

/**
 * A fingerprint of a layout's room — its floors, walls, outline and zones, not its
 * furniture — so a save can tell whether the hall's room had to be laid under what
 * the editor sent (the editor was opened before the hall plan changed).
 */
export function roomKey(raw: unknown): string {
	const state = migrateToMultiFloor(clone(raw));
	return JSON.stringify(state.floors.map((f) => [
		f.id, f.name ?? '',
		(f.walls ?? []).map((w) => [w.id, (w.points ?? []).map((p) => [r3(p.x), r3(p.y)])]),
		(f.zones ?? []).map((z) => [z.id, z.label ?? '', z.color ?? '', (z.points ?? []).map((p) => [r3(p.x), r3(p.y)])]),
		roomParts(f).map((p) => [r3(p.x), r3(p.y), r3(p.w), r3(p.h)])
	]));
}

/** Statuses of an event that is still going to happen. */
export const UPCOMING_STATUSES = ['pending', 'waiting_payment', 'approved', 'planned'] as const;

/** An event whose layout follows the hall's plan: not cancelled or completed, and
 *  not yet begun. Past events keep the room they took place in. */
export function followsHallPlan(ev: { status: string; event_date: string; start_time?: string | null }, nowMs = Date.now()): boolean {
	return (UPCOMING_STATUSES as readonly string[]).includes(ev.status) && !!ev.event_date && !hasEventStarted(ev.event_date, ev.start_time, nowMs);
}

/** Problems as stored in a `layout_problems` column: JSON, or null for none. */
export function problemsColumn(problems: LayoutProblem[]): string | null {
	return problems.length ? JSON.stringify(problems) : null;
}

/** A `layout_problems` column read back. Anything unreadable counts as none. */
export function parseProblems(raw: unknown): LayoutProblem[] {
	const v = clone(raw);
	if (!Array.isArray(v)) return [];
	return v.filter((p): p is LayoutProblem =>
		!!p && typeof p === 'object' && typeof (p as LayoutProblem).id === 'string' &&
		['wall', 'outside', 'floor'].includes((p as LayoutProblem).kind));
}
