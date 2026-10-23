// Event reminders: a client is emailed a few days before their event (M4).
//
// Run from the hourly housekeeping in hooks.server.ts and from /api/cron/cleanup.
// Each booking is claimed (reminder_sent_at set) before its email goes out, so two
// overlapping runs never remind twice; a booking moved to a new date is cleared
// (clearReminder) and reminded again before the new one.

import { dbAll, dbRun } from '$lib/db/index';
import { notifyEventReminder } from '$lib/email';
import type { D1Database } from '@cloudflare/workers-types';

/** How many days before the event the reminder goes out. */
export const REMINDER_DAYS = 3;
/** A booking made this recently already has its receipt: no reminder on top of it. */
const MIN_AGE_HOURS = 24;
/** Bookings reminded per run; the rest follow on the next run. */
const BATCH = 25;

/** Confirmed client bookings whose event is within REMINDER_DAYS and not yet reminded. */
export const DUE_REMINDERS_SQL = `
	SELECT r.id, r.org_id
	  FROM reservations r
	  JOIN users u ON u.id = r.user_id
	  JOIN organizations o ON o.id = r.org_id
	 WHERE r.status IN ('approved', 'planned')
	   AND r.reminder_sent_at IS NULL
	   AND u.account_type = 'client'
	   AND o.suspended_at IS NULL
	   AND substr(r.event_date, 1, 10) > date('now')
	   AND substr(r.event_date, 1, 10) <= date('now', '+${REMINDER_DAYS} days')
	   AND r.created_at <= datetime('now', '-${MIN_AGE_HOURS} hours')
	 ORDER BY r.event_date
	 LIMIT ${BATCH}`;

/** Send the reminders that are due. Returns how many bookings were claimed. Never
 *  throws: before migration 0027 there is no reminder_sent_at and nothing is sent. */
export async function sendEventReminders(db: D1Database): Promise<number> {
	let due: Array<{ id: string; org_id: string }>;
	try {
		due = await dbAll(db, DUE_REMINDERS_SQL);
	} catch {
		return 0;
	}
	let claimed = 0;
	for (const r of due) {
		const claim = await dbRun(db,
			"UPDATE reservations SET reminder_sent_at = datetime('now') WHERE id = ? AND reminder_sent_at IS NULL", r.id);
		if ((claim.meta?.changes ?? 0) === 0) continue; // another run took it
		claimed++;
		await notifyEventReminder(db, r.org_id, r.id).catch((err) => console.error('[reminders] send failed:', err));
	}
	return claimed;
}

/** The event moved: remind again before its new date. */
export async function clearReminder(db: D1Database, reservationId: string): Promise<void> {
	try {
		await dbRun(db, 'UPDATE reservations SET reminder_sent_at = NULL WHERE id = ?', reservationId);
	} catch { /* before migration 0027 */ }
}
