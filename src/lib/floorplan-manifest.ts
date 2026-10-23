/**
 * What the printed seating manifest shows for each floor: the tables by their
 * number (the same T1, T2… as the editor), who sits where, and the notes for staff.
 *
 * Shared by the staff and the client manifest, and by the CSV export, so all three
 * name a table the same way.
 */
import type { FloorData, Guest, MultiFloorState } from './floorplan-types';
import { tableNumbers, tableTag } from './floorplan-layout';

export interface ManifestSeatView { idx: number; guest: Guest | null }
export interface ManifestTableView {
	id: string;
	/** "T3" — the table's number, as on the plan. */
	tag: string;
	/** The table's own label, or its tag when it has none. */
	label: string;
	/** A note for staff ("one high chair"). */
	note: string;
	total: number;
	/** Only the seats with a guest on them. */
	seats: ManifestSeatView[];
}
export interface ManifestFloorView {
	name: string;
	idx: number;
	floor: FloorData;
	tables: ManifestTableView[];
	standalone: ManifestSeatView[];
	seatedCount: number;
	totalSeats: number;
}

export function manifestFloors(layout: MultiFloorState, floorName: (i: number) => string = (i) => `Floor ${i + 1}`): ManifestFloorView[] {
	const guestById = new Map(layout.guests.map((g) => [g.id, g]));
	const nums = tableNumbers(layout.floors);
	return layout.floors.map((f, fi) => {
		const tables = (f.tables ?? []).map((t) => {
			const tag = tableTag(nums.get(t.id));
			const seats = (t.assignments ?? [])
				.map((gid, idx) => ({ idx, guest: gid ? guestById.get(gid) ?? null : null }))
				.filter((s) => s.guest);
			return { id: t.id, tag, label: (t.label ?? '').trim() || tag, note: (t.note ?? '').trim(), total: (t.assignments ?? []).length, seats };
		});
		// Standalone chairs (concert-style seating, not attached to a table)
		const standalone = (f.seats ?? [])
			.map((s, i) => ({ idx: i, guest: s.assignment ? guestById.get(s.assignment) ?? null : null }))
			.filter((s) => s.guest);

		const seatedIds = new Set<string>();
		for (const t of f.tables ?? []) for (const a of t.assignments ?? []) if (a) seatedIds.add(a);
		for (const s of f.seats ?? []) if (s.assignment) seatedIds.add(s.assignment);
		const totalSeats = (f.tables ?? []).reduce((n, t) => n + (t.assignments ?? []).length, 0) + (f.seats?.length ?? 0);
		return { name: f.name || floorName(fi), idx: fi, floor: f, tables, standalone, seatedCount: seatedIds.size, totalSeats };
	});
}
