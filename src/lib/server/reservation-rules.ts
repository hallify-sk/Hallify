// Small, pure rules about reservations, kept apart from the database code so they
// can be tested directly.

/** Today's date as SQLite's date('now') sees it (UTC), which the sweeps compare against. */
export function todayUtcISO(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** Statuses that hold a date for an event that is still to happen. */
const LIVE = new Set(['pending', 'waiting_payment', 'approved', 'planned']);

export type TransitionProblem = 'ok' | 'completed_in_future' | 'date_passed';

/**
 * A status change that makes sense for the event's date?
 *  - 'Completed' is for events that have happened (today counts).
 *  - A request or booking cannot be (re)activated once its date has passed: a pending
 *    request for 2 October approved on 20 October e-mailed the client a confirmation
 *    for a day that was over.
 */
export function checkStatusTransition(from: string, to: string, eventDate: string, todayISO: string): TransitionProblem {
	const day = eventDate.slice(0, 10);
	if (to === 'completed' && day > todayISO) return 'completed_in_future';
	if (LIVE.has(to) && day < todayISO && from !== to) return 'date_passed';
	return 'ok';
}

/** A clock time as the form sends it ("9:05" or "09:05"), or null. */
export function normalizeTime(value: string | null | undefined): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(v);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** SQL run by the request-time sweep: requests whose date passed while still waiting expire. */
export const EXPIRE_PAST_REQUESTS_SQL = [
	`INSERT INTO reservation_activity (id, reservation_id, org_id, kind, status)
	 SELECT lower(hex(randomblob(16))), id, org_id, 'expired', 'cancelled' FROM reservations
	  WHERE event_date < date('now') AND status IN ('pending', 'waiting_payment')`,
	`UPDATE reservations SET status = 'cancelled', cancelled_by = 'expired'
	  WHERE event_date < date('now') AND status IN ('pending', 'waiting_payment')`,
];
