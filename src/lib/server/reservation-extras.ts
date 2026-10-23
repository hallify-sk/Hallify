// Storing a booking's extras together with the prices they were booked at (I8).
//
// Every path that changes a booking's extras (the venue-site booking form, the
// client's own edit and the staff edit) writes the ids to extras_json as before and
// then the priced snapshot here. The snapshot is written separately and never fails
// the action: before migration 0027 the column does not exist, and the booking must
// still be saved.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { HallExtraRow } from '$lib/db/index';
import { extrasSummary, parseExtrasSnapshot, snapshotExtras, withBookedPrices, type ExtraSnapshotItem } from '$lib/extras';
import type { ReservationChange } from '$lib/email';
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

/**
 * The extras change between two selections, for the "what changed" lines of an email,
 * or null when the selection and its total are the same. Each side is priced with its
 * own snapshot, so a total shown is the one the client agreed to.
 */
export async function extrasChange(
	db: D1Database,
	hallId: string,
	numGuests: number | null,
	before: { ids: string[]; snapshot: ExtraSnapshotItem[] },
	after: { ids: string[]; snapshot: ExtraSnapshotItem[] }
): Promise<ReservationChange | null> {
	const live = await dbAll<HallExtraRow>(db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at, id', hallId);
	const from = extrasSummary(withBookedPrices(live, before.snapshot), before.ids, numGuests);
	const to = extrasSummary(withBookedPrices(live, after.snapshot), after.ids, numGuests);
	if (from.text === to.text && from.cents === to.cents) return null;
	return { field: 'extras', from: from.text, to: to.text, fromCents: from.cents, toCents: to.cents };
}
