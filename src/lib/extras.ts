// Hall extras — bookable add-ons (fixed or per-guest priced). Selection is stored
// on the reservation as a JSON array of hall_extras ids (extras_json), and the name
// and price each one was booked at in extras_snapshot_json (migration 0027). Totals
// use the booked price: editing the price list no longer changes agreed totals. An
// extra the client adds later is booked at the price of that moment.

import type { HallExtraRow } from '$lib/db/index';
import { formatMoney, type Locale } from '$lib/format';

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

/** One booked extra as it was priced when it was booked. */
export interface ExtraSnapshotItem {
	id: string;
	name: string;
	description: string | null;
	pricing: 'fixed' | 'per_guest';
	price_cents: number;
}

/** Parse reservations.extras_snapshot_json; anything malformed is dropped. */
export function parseExtrasSnapshot(json: string | null | undefined): ExtraSnapshotItem[] {
	if (!json) return [];
	let v: unknown;
	try { v = JSON.parse(json); } catch { return []; }
	if (!Array.isArray(v)) return [];
	const out: ExtraSnapshotItem[] = [];
	for (const x of v) {
		if (!x || typeof x !== 'object') continue;
		const o = x as Record<string, unknown>;
		const price = Number(o.price_cents);
		if (typeof o.id !== 'string' || !Number.isFinite(price)) continue;
		out.push({
			id: o.id,
			name: typeof o.name === 'string' ? o.name : '',
			description: typeof o.description === 'string' ? o.description : null,
			pricing: o.pricing === 'per_guest' ? 'per_guest' : 'fixed',
			price_cents: Math.round(price),
		});
	}
	return out;
}

/**
 * The snapshot to store for a new selection. An extra that was already booked keeps
 * the price it was booked at; a newly added one is taken from today's price list.
 * Ids found in neither are dropped.
 */
export function snapshotExtras(
	selectedIds: string[],
	live: Array<Pick<HallExtraRow, 'id' | 'name' | 'description' | 'pricing' | 'price_cents'>>,
	previous: ExtraSnapshotItem[] = []
): ExtraSnapshotItem[] {
	const booked = new Map(previous.map((p) => [p.id, p]));
	const current = new Map(live.map((e) => [e.id, e]));
	const out: ExtraSnapshotItem[] = [];
	for (const id of new Set(selectedIds)) {
		const keep = booked.get(id);
		if (keep) { out.push(keep); continue; }
		const e = current.get(id);
		if (e) out.push({ id: e.id, name: e.name, description: e.description, pricing: e.pricing, price_cents: e.price_cents });
	}
	return out;
}

/** A hall extra as shown on a booking: priced as booked, with today's price beside it
 *  when that differs (`live_price_cents`), and `retired` when the venue has since
 *  deleted it (it stays on the booking at the agreed price). */
export type BookedExtra = HallExtraRow & { live_price_cents: number | null; retired: boolean };

/**
 * The hall's extras with the booking's agreed prices laid over them, for the pages
 * that list extras next to a booking. Booked extras the hall no longer offers are
 * appended, so an agreed line never disappears from the booking.
 */
export function withBookedPrices(live: HallExtraRow[], snapshot: ExtraSnapshotItem[]): BookedExtra[] {
	const booked = new Map(snapshot.map((s) => [s.id, s]));
	const out: BookedExtra[] = live.map((e) => {
		const b = booked.get(e.id);
		if (!b) return { ...e, live_price_cents: null, retired: false };
		return {
			...e,
			pricing: b.pricing,
			price_cents: b.price_cents,
			live_price_cents: b.price_cents !== e.price_cents || b.pricing !== e.pricing ? e.price_cents : null,
			retired: false,
		};
	});
	const liveIds = new Set(live.map((e) => e.id));
	const hallId = live[0]?.hall_id ?? '';
	for (const b of snapshot) {
		if (liveIds.has(b.id)) continue;
		out.push({ ...b, hall_id: hallId, created_at: '', live_price_cents: null, retired: true });
	}
	return out;
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

/** The selection in words and what it comes to: "Catering ×80, Projektor" / 2 900 €.
 *  `text` is null when nothing is selected. For change summaries in emails. */
export function extrasSummary(
	extras: HallExtraRow[],
	selectedIds: string[],
	numGuests: number | null
): { text: string | null; cents: number } {
	const { lines, totalCents } = computeExtras(extras, selectedIds, numGuests);
	return {
		text: lines.length ? lines.map((l) => (l.pricing === 'per_guest' ? `${l.name} ×${l.qty}` : l.name)).join(', ') : null,
		cents: totalCents,
	};
}

/** Format cents as a EUR string in the viewer's style: 11,50 € (sk) · €11.50 (en). */
export function eur(cents: number, locale: Locale | string = 'sk'): string {
	return formatMoney(cents, locale);
}
