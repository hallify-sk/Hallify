/**
 * Whole-layout operations on an event's seating: starting it over from a template
 * without losing the guests, and telling whether two layouts are the same
 * arrangement of furniture (whatever the seating).
 *
 * Pure, so the staff and the client routes share one rule and it is tested.
 */

import { migrateToMultiFloor, type MultiFloorState } from './floorplan-types';
import { totalChairs } from './floorplan-geometry';

export interface TemplateApplied {
	layout: MultiFloorState;
	/** Guests who kept their chair because it exists in the template too. */
	reseated: number;
	/** Guests who were seated before and are not any more. */
	unseated: number;
}

/**
 * The template's furniture with the event's guest list kept.
 *
 * Applying a template used to replace the whole layout, guests included, so 13
 * seated guests became 0 with no way back. Now the guest list always survives.
 * A guest whose chair also exists in the template — the same table (by id) and
 * chair number, or the same standalone chair — stays on it; everyone else is left
 * on the list, unseated, to be placed again.
 */
export function applyTemplateKeepingGuests(current: unknown, template: unknown): TemplateApplied {
	const cur = migrateToMultiFloor(clone(current));
	const tpl = migrateToMultiFloor(clone(template));
	const guestIds = new Set(cur.guests.map((g) => g.id));

	const tableSeat = new Map<string, string>();   // `${tableId}#${chair}` → guest
	const chairSeat = new Map<string, string>();   // standalone chair id → guest
	let seatedBefore = 0;
	for (const f of cur.floors) {
		for (const t of f.tables ?? []) (t.assignments ?? []).forEach((g, i) => {
			if (g && guestIds.has(g)) { tableSeat.set(`${t.id}#${i}`, g); seatedBefore++; }
		});
		for (const s of f.seats ?? []) if (s.assignment && guestIds.has(s.assignment)) { chairSeat.set(s.id, s.assignment); seatedBefore++; }
	}

	const placed = new Set<string>();
	const take = (g: string | undefined) => (g && !placed.has(g) ? (placed.add(g), g) : null);
	for (const f of tpl.floors) {
		f.tables = (f.tables ?? []).map((t) => ({
			...t,
			assignments: Array.from({ length: totalChairs(t) }, (_, i) => take(tableSeat.get(`${t.id}#${i}`)))
		}));
		f.seats = (f.seats ?? []).map((s) => ({ ...s, assignment: take(chairSeat.get(s.id)) }));
	}

	return {
		layout: { version: 2, floors: tpl.floors, guests: cur.guests },
		reseated: placed.size,
		unseated: Math.max(0, seatedBefore - placed.size)
	};
}

const r3 = (v: unknown) => Math.round((Number(v) || 0) * 1000) / 1000;

/**
 * A fingerprint of the furniture: floors, tables (where, how big, how many chairs,
 * which type), standalone chairs and zones — but not who sits where, the guest
 * list or a table's note for staff. Two layouts with the same key differ only in
 * seating, which is what a client of a hall that does not let clients rearrange
 * tables may still change.
 */
export function arrangementKey(raw: unknown): string {
	const state = migrateToMultiFloor(clone(raw));
	return JSON.stringify(state.floors.map((f) => ({
		id: f.id,
		tables: (f.tables ?? []).map((t) => [
			t.id, t.shape, r3(t.x), r3(t.y), r3(t.rotation), r3(t.width), r3(t.height), r3(t.radius),
			totalChairs(t), r3(t.chairsTop), r3(t.chairsBottom), r3(t.chairsLeft), r3(t.chairsRight), t.typeId ?? null
		]),
		seats: (f.seats ?? []).map((s) => [s.id, r3(s.x), r3(s.y), r3(s.rotation)]),
		zones: (f.zones ?? []).map((z) => [z.id, (z.points ?? []).map((p) => [r3(p.x), r3(p.y)])])
	})));
}

/**
 * A short fingerprint of a stored plan, so a save can tell whether the plan it was
 * edited from is still the one in the database. Content-based, so every writer
 * (the editor, the assistant, an import) counts without having to bump anything.
 */
export async function layoutVersion(stored: string | null | undefined): Promise<string> {
	const bytes = new TextEncoder().encode(stored ?? '');
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clone<T>(v: T): T {
	if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null as T; } }
	return v == null ? v : JSON.parse(JSON.stringify(v));
}
