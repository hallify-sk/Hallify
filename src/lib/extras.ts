// Hall extras — bookable add-ons (fixed or per-guest priced). Selection is stored
// on the reservation as a JSON array of hall_extras ids; cost is computed live
// against the current extras so it's an informational overview, not a snapshot.

import type { HallExtraRow } from '$lib/db/index';

export interface ExtraLine {
	id: string;
	name: string;
	description: string | null;
	pricing: 'fixed' | 'per_guest';
	unit_cents: number;
	qty: number;
	line_cents: number;
}

/** Parse reservations.extras_json into an id array. */
export function parseExtraIds(json: string | null | undefined): string[] {
	if (!json) return [];
	try { const v = JSON.parse(json); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

/** Build cost lines for the selected extras. Per-guest extras multiply by the
 *  guest count (min 1); fixed extras are charged once. */
export function computeExtras(
	extras: HallExtraRow[],
	selectedIds: string[],
	numGuests: number | null
): { lines: ExtraLine[]; totalCents: number } {
	const guests = Math.max(1, numGuests ?? 1);
	const byId = new Map(extras.map((e) => [e.id, e]));
	const lines: ExtraLine[] = [];
	for (const id of selectedIds) {
		const e = byId.get(id);
		if (!e) continue; // extra was deleted since selection
		const qty = e.pricing === 'per_guest' ? guests : 1;
		lines.push({
			id: e.id, name: e.name, description: e.description, pricing: e.pricing,
			unit_cents: e.price_cents, qty, line_cents: e.price_cents * qty,
		});
	}
	return { lines, totalCents: lines.reduce((s, l) => s + l.line_cents, 0) };
}

/** Format cents as a EUR string. */
export function eur(cents: number): string {
	return '€' + (cents / 100).toFixed(2);
}
