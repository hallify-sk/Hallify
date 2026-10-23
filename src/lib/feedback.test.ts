import { describe, expect, it } from 'vitest';
import { addDaysISO, feedbackDeadline, feedbackState, formatRating, parseFeedbackForm, stars, summariseRatings } from './feedback';

describe('feedback window (D5)', () => {
	it('closes 14 days after the event, or after a later invitation', () => {
		expect(addDaysISO('2026-12-25', 14)).toBe('2027-01-08');
		expect(feedbackDeadline('2026-10-01', null)).toBe('2026-10-15');
		expect(feedbackDeadline('2026-10-01', '2026-10-05 08:00:00')).toBe('2026-10-19');
		// An invitation stamped before the event (never in practice) does not shorten it.
		expect(feedbackDeadline('2026-10-01', '2026-09-20 08:00:00')).toBe('2026-10-15');
	});

	const base = { allowFeedback: 1, status: 'completed', eventDate: '2026-10-01', requestedAt: null, hasFeedback: false, todayISO: '2026-10-10' };

	it('opens only on a completed event of a hall that asks', () => {
		expect(feedbackState(base)).toBe('open');
		expect(feedbackState({ ...base, status: 'approved' })).toBe('hidden');
		expect(feedbackState({ ...base, status: 'cancelled', hasFeedback: true })).toBe('hidden');
		expect(feedbackState({ ...base, allowFeedback: 0 })).toBe('hidden');
	});

	it('keeps a given rating visible, read-only, once the window or the hall closes', () => {
		expect(feedbackState({ ...base, allowFeedback: 0, hasFeedback: true })).toBe('closed');
		expect(feedbackState({ ...base, todayISO: '2026-10-15' })).toBe('open');
		expect(feedbackState({ ...base, todayISO: '2026-10-16', hasFeedback: true })).toBe('closed');
		expect(feedbackState({ ...base, todayISO: '2026-10-16' })).toBe('hidden');
	});
});

describe('feedback form', () => {
	it('takes one to five stars and an optional comment', () => {
		expect(parseFeedbackForm({ rating: '5', comment: '  Super!\r\nĎakujeme ' })).toEqual({ ok: true, values: { rating: 5, comment: 'Super!\nĎakujeme' } });
		expect(parseFeedbackForm({ rating: '1', comment: '' })).toEqual({ ok: true, values: { rating: 1, comment: null } });
		for (const bad of ['', '0', '6', '3.5', 'x', '-1']) expect(parseFeedbackForm({ rating: bad })).toEqual({ ok: false, field: 'rating' });
		expect(parseFeedbackForm({ rating: '4', comment: 'a'.repeat(2001) })).toEqual({ ok: false, field: 'comment' });
	});
});

describe('rating summary', () => {
	it('averages to one decimal and counts each star', () => {
		const s = summariseRatings([5, 4, 4, null, 7, 3]);
		expect(s.count).toBe(4);
		expect(s.average).toBe(4);
		expect(s.distribution).toEqual([0, 0, 1, 2, 1]);
		expect(summariseRatings([5, 4, 4]).average).toBe(4.3);
		expect(summariseRatings([]).average).toBeNull();
	});

	it('formats for the reader', () => {
		expect(formatRating(4.3, 'sk')).toBe('4,3');
		expect(formatRating(4.3, 'en')).toBe('4.3');
		expect(formatRating(null)).toBe('—');
		expect(stars(4)).toBe('★★★★☆');
	});
});
