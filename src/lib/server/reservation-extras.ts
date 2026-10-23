// Storing a booking's extras together with the prices they were booked at (I8).
//
// Every path that changes a booking's extras (the venue-site booking form, the
// client's own edit and the staff edit) writes the ids to extras_json as before and
// then the priced snapshot here. The snapshot is written separately and never fails
// the action: before migration 0027 the column does not exist, and the booking must
// still be saved.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { HallExtraRow } from '$lib/db/index';
import { computeExtras, parseExtraIds, parseExtrasSnapshot, snapshotExtras, withBookedPrices, type ExtraSnapshotItem } from '$lib/extras';
import type { D1Database } from '@cloudflare/workers-types';

/** The booking's stored snapshot, or [] (no column yet, or nothing booked). */
export async function loadExtrasSnapshot(db: D1Database, reservationId: string): Promise<ExtraSnapshotItem[]> {
	try {
		const row = await dbFirst<{ extras_snapshot_json: string | null }>(db,
			'SELECT extras_snapshot_json FROM reservations WHERE id = ?', reservationId);
		return parseExtrasSnapshot(row?.extras_snapshot_json);
	} catch {
		return [];
	}
}

/**
 * Write the snapshot for `selectedIds` (already validated by the caller). Extras that
 * were booked before keep their booked price; new ones are priced from the hall's
 * current list. Returns the snapshot written.
 */
export async function saveExtrasSnapshot(
	db: D1Database,
	reservationId: string,
	hallId: string,
	selectedIds: string[],
	previous: ExtraSnapshotItem[] = []
): Promise<ExtraSnapshotItem[]> {
	const live = selectedIds.length
		? await dbAll<HallExtraRow>(db, 'SELECT * FROM hall_extras WHERE hall_id = ?', hallId)
		: [];
	const snapshot = snapshotExtras(selectedIds, live, previous);
	try {
		await dbRun(db, 'UPDATE reservations SET extras_snapshot_json = ? WHERE id = ?',
			snapshot.length ? JSON.stringify(snapshot) : null, reservationId);
	} catch (err) {
		console.error('saving the extras price snapshot failed:', err);
	}
	return snapshot;
}

/** What a booking's extras come to, priced as booked (legacy rows without a snapshot
 *  fall back to today's prices). For emails and summaries. */
export async function bookedExtrasTotal(
	db: D1Database,
	reservation: { id: string; hall_id: string; extras_json: string | null; num_guests: number | null }
): Promise<{ names: string[]; totalCents: number }> {
	const ids = parseExtraIds(reservation.extras_json);
	if (!ids.length) return { names: [], totalCents: 0 };
	const live = await dbAll<HallExtraRow>(db, 'SELECT * FROM hall_extras WHERE hall_id = ?', reservation.hall_id);
	const priced = withBookedPrices(live, await loadExtrasSnapshot(db, reservation.id));
	const { lines, totalCents } = computeExtras(priced, ids, reservation.num_guests);
	return { names: lines.map((l) => (l.pricing === 'per_guest' ? `${l.name} ×${l.qty}` : l.name)), totalCents };
}
