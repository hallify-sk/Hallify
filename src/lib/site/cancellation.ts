// A venue's minimum cancellation notice (halls.min_cancel_days), as the client sees it.
//
// The cancel action enforced the notice, but the page offered the Cancel button and its
// confirm step regardless, so a client 14 days out with 30 days' notice only learned
// about the rule from the refusal. Page and action now share this one rule.

const DAY_MS = 24 * 60 * 60 * 1000;

/** True while the client may still cancel: at least `minDays` (rounded up) before the event. */
export function withinCancelNotice(eventDate: string, minDays: number | null | undefined, nowMs: number = Date.now()): boolean {
	const min = Math.max(0, Number(minDays) || 0);
	if (min === 0) return true;
	const eventMs = Date.parse(eventDate.slice(0, 10));
	if (Number.isNaN(eventMs)) return true;
	return Math.ceil((eventMs - nowMs) / DAY_MS) >= min;
}

/** The last day (YYYY-MM-DD) on which the client can cancel, or null with no notice period. */
export function cancelDeadline(eventDate: string, minDays: number | null | undefined): string | null {
	const min = Math.max(0, Number(minDays) || 0);
	if (min === 0) return null;
	const eventMs = Date.parse(eventDate.slice(0, 10));
	if (Number.isNaN(eventMs)) return null;
	return new Date(eventMs - min * DAY_MS).toISOString().slice(0, 10);
}
