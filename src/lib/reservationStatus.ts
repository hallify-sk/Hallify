// Shared reservation status labels + badge classes + date formatting for the
// client area. Badge classes (`st-*`) are styled per-page with theme tokens.

export const STATUS_LABEL: Record<string, string> = {
	pending: 'Pending',
	waiting_payment: 'Awaiting payment',
	approved: 'Approved',
	planned: 'Planned',
	completed: 'Completed',
	cancelled: 'Cancelled',
};

export const STATUS_CLASS: Record<string, string> = {
	pending: 'st-warning',
	waiting_payment: 'st-warning',
	approved: 'st-success',
	planned: 'st-info',
	completed: 'st-muted',
	cancelled: 'st-danger',
};

export function statusLabel(s: string): string {
	return STATUS_LABEL[s] ?? s;
}

export function statusClass(s: string): string {
	return STATUS_CLASS[s] ?? 'st-muted';
}

/** event_date is stored as YYYY-MM-DD — render it in the local timezone. */
export function fmtDate(d: string | Date): string {
	const dt = typeof d === 'string'
		? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d)
		: new Date(d);
	return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Parse "YYYY-MM-DD" + optional "HH:MM" to epoch ms, interpreting the naive value as
 *  UTC so the server (UTC runtime) and the client (local) agree on the threshold —
 *  matching the app's existing naive date model (SQL uses date('now') = UTC). */
function eventMs(date: string, time: string | null | undefined, fallback: string): number {
	const t = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : fallback;
	return Date.parse(`${date}T${t}:00Z`);
}

/** True once the event has BEGUN — used to lock client edits at event start.
 *  A whole-day event (no start_time) starts at 00:00 of the event date. */
export function hasEventStarted(date: string, startTime?: string | null, nowMs: number = Date.now()): boolean {
	return nowMs >= eventMs(date, startTime, '00:00');
}

/** True once the event is OVER — drives the visual "Past" marker.
 *  Without an end_time, an event is past after the end of its date (23:59). */
export function isEventPast(date: string, endTime?: string | null, nowMs: number = Date.now()): boolean {
	return nowMs > eventMs(date, endTime, '23:59');
}
