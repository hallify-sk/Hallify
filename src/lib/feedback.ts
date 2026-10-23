// Client feedback on a finished event (D5).
//
// When a hall asks for feedback (halls.allow_feedback) and a client's event is
// completed, the client is invited once by email and sees a card on their booking:
// 1–5 stars and an optional comment. They can give it, and change it, for
// FEEDBACK_DAYS after the event (or after the invitation, when that came later).
// One rating per reservation. Private to the venue: the staff reservation page, the
// hall's average and the client's card in the client list; never a public page.
//
// Shared by the venue site, the console and the server, so nothing here touches the
// database (see $lib/server/feedback).

import { formatNumber } from '$lib/format';

/** Days the card stays open for a rating or a change of it. */
export const FEEDBACK_DAYS = 14;
export const FEEDBACK_COMMENT_MAX = 2000;
export const RATINGS = [1, 2, 3, 4, 5] as const;

export interface FeedbackRow {
	reservation_id: string;
	rating: number;
	comment: string | null;
	created_at: string;
	updated_at: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** YYYY-MM-DD plus n days (UTC calendar arithmetic). */
export function addDaysISO(day: string, n: number): string {
	const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** The last day the client can rate or change the rating: FEEDBACK_DAYS after the
 *  event, or after the invitation when that went out later. */
export function feedbackDeadline(eventDate: string, requestedAt: string | null | undefined): string {
	const event = eventDate.slice(0, 10);
	const invited = requestedAt && ISO_DAY.test(requestedAt) ? requestedAt.slice(0, 10) : '';
	return addDaysISO(invited > event ? invited : event, FEEDBACK_DAYS);
}

export type FeedbackState =
	/** No card: the hall does not ask, or the event is not completed. */
	| 'hidden'
	/** The card takes a rating or a change. */
	| 'open'
	/** The window has passed: what was given is shown, read-only. */
	| 'closed';

export function feedbackState(input: {
	allowFeedback: boolean | number | null | undefined;
	status: string;
	eventDate: string;
	requestedAt?: string | null;
	hasFeedback: boolean;
	todayISO: string;
}): FeedbackState {
	if (input.status !== 'completed') return 'hidden';
	if (input.todayISO <= feedbackDeadline(input.eventDate, input.requestedAt)) {
		// A hall that stopped asking takes no new ratings, but one already given stays.
		if (input.allowFeedback) return 'open';
		return input.hasFeedback ? 'closed' : 'hidden';
	}
	return input.hasFeedback ? 'closed' : 'hidden';
}

export type FeedbackField = 'rating' | 'comment';

/** The client's form, validated. The comment is optional. */
export function parseFeedbackForm(input: { rating?: string | null; comment?: string | null }):
	| { ok: true; values: { rating: number; comment: string | null } }
	| { ok: false; field: FeedbackField } {
	const raw = String(input.rating ?? '').trim();
	const rating = /^[1-5]$/.test(raw) ? Number(raw) : NaN;
	if (!Number.isInteger(rating)) return { ok: false, field: 'rating' };
	const comment = String(input.comment ?? '').replace(/\r\n/g, '\n').trim();
	if (comment.length > FEEDBACK_COMMENT_MAX) return { ok: false, field: 'comment' };
	return { ok: true, values: { rating, comment: comment || null } };
}

export interface RatingSummary {
	count: number;
	/** Mean rating, rounded to one decimal; null with no ratings. */
	average: number | null;
	/** How many ratings of each star, index 0 = one star. */
	distribution: [number, number, number, number, number];
}

export function summariseRatings(ratings: Iterable<number | null | undefined>): RatingSummary {
	const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
	let sum = 0;
	let count = 0;
	for (const r of ratings) {
		const n = Number(r);
		if (!Number.isInteger(n) || n < 1 || n > 5) continue;
		distribution[n - 1]++;
		sum += n;
		count++;
	}
	return { count, average: count ? Math.round((sum / count) * 10) / 10 : null, distribution };
}

/** "4,6" (sk) · "4.6" (en); "—" with no ratings. */
export function formatRating(average: number | null | undefined, locale: string = 'sk'): string {
	return average == null ? '—' : formatNumber(average, locale, 1);
}

/** "★★★★☆" for a whole rating, for compact displays and emails. */
export function stars(rating: number): string {
	const n = Math.max(0, Math.min(5, Math.round(rating)));
	return '★'.repeat(n) + '☆'.repeat(5 - n);
}
