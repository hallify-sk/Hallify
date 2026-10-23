import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { HOLD_FRESH_LIMIT, acquireOrRenewHold, addDays, isRealDateISO, isoLocal, expandWeekdays, unavailableDates, monthName, getFullMonths, assertCanBook } from './availability';

describe('isRealDateISO', () => {
	it('refuses dates that only look like dates', () => {
		expect(isRealDateISO('2026-13-99')).toBe(false);
		expect(isRealDateISO('2026-02-30')).toBe(false);
		expect(isRealDateISO('2026-1-5')).toBe(false);
	});
	it('accepts real days, leap days included', () => {
		expect(isRealDateISO('2028-02-29')).toBe(true);
		expect(isRealDateISO('2026-10-23')).toBe(true);
	});
});

describe('acquireOrRenewHold', () => {
	const open: DatabaseSync[] = [];
	afterEach(() => {
		for (const d of open.splice(0)) d.close();
	});

	function setup() {
		const sqlite = new DatabaseSync(':memory:');
		open.push(sqlite);
		const sql = (n: string) => readFileSync(new URL(`../../migrations/${n}`, import.meta.url), 'utf8');
		sqlite.exec(sql('0001_baseline.sql'));
		sqlite.exec(sql('0002_rate_limits.sql'));
		sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Venue','venue')");
		sqlite.exec("INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('c1','c1@x.sk','h','A','B'), ('c2','c2@x.sk','h','A','B')");
		for (let i = 1; i <= 5; i++) {
			sqlite.exec(`INSERT INTO halls(id,org_id,name,max_people,is_public) VALUES ('h${i}','o1','Hall ${i}',100,1)`);
		}
		const stmt = (q: string) => sqlite.prepare(q);
		const db = {
			prepare: (q: string) => ({
				bind: (...args: unknown[]) => ({
					first: async () => (stmt(q).get(...(args as never[])) as unknown) ?? null,
					run: async () => {
						const r = stmt(q).run(...(args as never[]));
						return { meta: { changes: Number(r.changes) } };
					},
					all: async () => ({ results: stmt(q).all(...(args as never[])) })
				})
			})
		} as unknown as App.Locals['db'];
		return { sqlite, db };
	}

	const day = (n: number) => isoLocal(addDays(new Date(), n));
	const CLIENT = { maxActive: 3, maxLifetimeMinutes: 30, freshLimit: HOLD_FRESH_LIMIT };

	it('refuses an impossible date', async () => {
		const { db } = setup();
		expect(await acquireOrRenewHold(db, { hallId: 'h1', eventDate: '2026-13-99', userId: 'c1' })).toMatchObject({
			ok: false,
			reason: 'invalid'
		});
	});

	// B26: one client held 30+ dates and blocked the venue's own bookings.
	it('caps how many dates one client holds at once', async () => {
		const { db } = setup();
		for (let i = 1; i <= 3; i++) {
			expect((await acquireOrRenewHold(db, { hallId: `h${i}`, eventDate: day(30), userId: 'c1', ...CLIENT })).ok).toBe(true);
		}
		expect(await acquireOrRenewHold(db, { hallId: 'h4', eventDate: day(30), userId: 'c1', ...CLIENT })).toMatchObject({
			ok: false,
			reason: 'limit'
		});
		// Renewing one already held is not a new hold, and somebody else is unaffected.
		expect((await acquireOrRenewHold(db, { hallId: 'h1', eventDate: day(30), userId: 'c1', ...CLIENT })).ok).toBe(true);
		expect((await acquireOrRenewHold(db, { hallId: 'h4', eventDate: day(30), userId: 'c2', ...CLIENT })).ok).toBe(true);
	});

	it('does not let renewal carry a hold past its lifetime', async () => {
		const { sqlite, db } = setup();
		expect((await acquireOrRenewHold(db, { hallId: 'h1', eventDate: day(30), userId: 'c1', ...CLIENT })).ok).toBe(true);
		// Taken 29 minutes ago: a renewal may give it one more minute, not fifteen.
		sqlite.exec("UPDATE reservation_holds SET created_at = datetime('now', '-29 minutes')");
		const renewed = await acquireOrRenewHold(db, { hallId: 'h1', eventDate: day(30), userId: 'c1', ...CLIENT });
		expect(renewed.ok).toBe(true);
		expect(renewed.ttl).toBeLessThanOrEqual(61);
		// Taken 31 minutes ago (and kept alive until now): over.
		sqlite.exec("UPDATE reservation_holds SET created_at = datetime('now', '-31 minutes'), expires_at = datetime('now', '+5 minutes')");
		expect(await acquireOrRenewHold(db, { hallId: 'h1', eventDate: day(30), userId: 'c1', ...CLIENT })).toMatchObject({
			ok: false,
			reason: 'expired'
		});
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM reservation_holds').get()).toMatchObject({ n: 0 });
	});

	it('limits how often the same date can be freshly held', async () => {
		const { db } = setup();
		const take = () => acquireOrRenewHold(db, { hallId: 'h1', eventDate: day(30), userId: 'c1', ...CLIENT });
		const drop = () => db.prepare('DELETE FROM reservation_holds').bind().run();
		for (let i = 0; i < HOLD_FRESH_LIMIT.limit; i++) {
			expect((await take()).ok).toBe(true);
			await drop();
		}
		expect(await take()).toMatchObject({ ok: false, reason: 'too-often' });
	});

	it('leaves staff holds uncapped', async () => {
		const { db } = setup();
		for (let i = 1; i <= 5; i++) {
			expect((await acquireOrRenewHold(db, { hallId: `h${i}`, eventDate: day(10), userId: 'c1' })).ok).toBe(true);
		}
	});
});


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
