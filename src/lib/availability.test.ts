import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { HOLD_FRESH_LIMIT, acquireOrRenewHold, addDays, isRealDateISO, isoLocal } from './availability';

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
