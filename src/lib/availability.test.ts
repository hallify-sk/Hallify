import { describe, expect, it } from 'vitest';
import { expandWeekdays, unavailableDates, monthName, getFullMonths, assertCanBook } from './availability';

describe('unavailableDates', () => {
	it('includes weekdays the venue marks closed, not only hall blocks', () => {
		// 2026-11-02 is a Monday; Sunday the 8th and Monday the 9th are closed.
		const hours = JSON.stringify({ mon: { open: false }, sun: { open: false }, tue: { open: true } });
		const out = unavailableDates([], hours, '2026-11-02', '2026-11-09');
		expect(out).toEqual(['2026-11-02', '2026-11-08', '2026-11-09']);
	});

	it('merges blocks and closed days without duplicates', () => {
		const blocks = [{ block_type: 'date_range', date_from: '2026-11-03', date_to: '2026-11-04', days_of_week: [] }];
		const hours = { tue: { open: false } };
		expect(unavailableDates(blocks, hours, '2026-11-02', '2026-11-05')).toEqual(['2026-11-03', '2026-11-04']);
	});

	it('closes nothing when opening hours are unset', () => {
		expect(unavailableDates([], null, '2026-11-02', '2026-11-08')).toEqual([]);
		expect(expandWeekdays([], '2026-11-02', '2026-11-08')).toEqual([]);
	});
});

describe('monthName', () => {
	it('names the month in the visitor language', () => {
		expect(monthName('2026-11', 'en')).toBe('November 2026');
		expect(monthName('2026-11', 'sk').toLowerCase()).toContain('2026');
		expect(monthName('2026-11', 'sk')).not.toContain('2026-11');
	});
});

/** A tiny fake D1 that answers by matching the SQL text. */
function fakeDb(answer: (sql: string, params: unknown[]) => unknown) {
	return {
		prepare(sql: string) {
			let params: unknown[] = [];
			const stmt = {
				bind(...p: unknown[]) { params = p; return stmt; },
				async first() { return answer(sql, params) ?? null; },
				async all() { return { results: (answer(sql, params) as unknown[]) ?? [] }; },
				async run() { return { success: true }; }
			};
			return stmt;
		}
	} as never;
}

describe('getFullMonths', () => {
	it('reports months at the plan cap, and nothing on an unlimited plan', async () => {
		const db = fakeDb((sql) => {
			if (sql.includes('FROM subscriptions')) return { plan: 'free' };
			if (sql.includes('GROUP BY m')) return [{ m: '2026-11', n: 5 }];
			return null;
		});
		expect(await getFullMonths(db, { id: 'h', org_id: 'o' }, '2026-10-23', '2027-04-30')).toEqual(['2026-11']);

		const unlimited = fakeDb((sql) => (sql.includes('FROM subscriptions') ? { plan: 'enterprise' } : null));
		expect(await getFullMonths(unlimited, { id: 'h', org_id: 'o' }, '2026-10-23', '2027-04-30')).toEqual([]);
	});
});

describe('assertCanBook', () => {
	const hall = { id: 'h', org_id: 'o', allow_reservations: 1, max_people: 100, min_days_advance: 0 };

	it('refuses a full month without revealing the plan limit', async () => {
		const db = fakeDb((sql) => {
			if (sql.includes('FROM subscriptions')) return { plan: 'free' };
			if (sql.includes('COUNT(*)')) return { n: 5 };
			return null;
		});
		const r = await assertCanBook(db, hall, '2099-11-09', 'u', null, 'sk');
		expect(r.ok).toBe(false);
		expect(r.reason).not.toMatch(/limit|5/);
		expect(r.reason).not.toContain('2099-11');
	});

	it('refuses a weekday the venue is closed', async () => {
		const db = fakeDb((sql) => {
			if (sql.includes('FROM subscriptions')) return { plan: 'enterprise' };
			if (sql.includes('opening_hours')) return { opening_hours: JSON.stringify({ sun: { open: false } }) };
			if (sql.includes('hall_blocks')) return [];
			return null;
		});
		// 2099-11-08 is a Sunday.
		const r = await assertCanBook(db, hall, '2099-11-08', 'u', null, 'en');
		expect(r).toEqual({ ok: false, reason: 'The venue is closed on this day. Please choose another date.' });
	});
});
