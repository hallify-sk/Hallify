import { describe, expect, it } from 'vitest';
import { d1, migratedSqlite } from './test-d1';
import { reservationsInRange } from './hall-archive';

/** A date `days` from today, as YYYY-MM-DD (UTC, as SQLite's date('now')). */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function setup() {
	const sqlite = migratedSqlite('0014');
	sqlite.exec(`INSERT INTO organizations(id,name,slug) VALUES ('o1','Org','org');
		INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('u1','a@b.sk','x','Ana','B');
		INSERT INTO halls(id,org_id,name,slug) VALUES ('h1','o1','One','one'), ('h2','o1','Two','two');`);
	const add = (id: string, hall: string, date: string, status = 'approved') =>
		sqlite.prepare(`INSERT INTO reservations(id,org_id,hall_id,user_id,title,event_date,status,invite_code) VALUES (?,?,?,?,?,?,?,?)`)
			.run(id, 'o1', hall, 'u1', id, date, status, `code-${id}`);
	return { sqlite, db: d1(sqlite), add };
}

describe('reservationsInRange', () => {
	it('takes only live, upcoming bookings of this hall on the blocked weekdays', async () => {
		const { db, add } = setup();
		const day1 = inDays(10), day2 = inDays(11), day3 = inDays(12);
		add('in', 'h1', day1);
		add('other-day', 'h1', day2);
		add('cancelled', 'h1', day3, 'cancelled');
		add('other-hall', 'h2', day1);
		add('past', 'h1', inDays(-3));
		const all = await reservationsInRange(db, 'h1', { from: inDays(-5), to: day3 });
		expect(all.map((r) => r.id).sort()).toEqual(['in', 'other-day']);
		const onlyFirstDay = await reservationsInRange(db, 'h1', { from: day1, to: day3, days: [weekday(day1)] });
		expect(onlyFirstDay.map((r) => r.id)).toEqual(['in']);
		expect(onlyFirstDay[0].client_email).toBe('a@b.sk');
	});

	it('refuses a malformed range', async () => {
		const { db } = setup();
		expect(await reservationsInRange(db, 'h1', { from: 'x', to: inDays(3) })).toEqual([]);
		expect(await reservationsInRange(db, 'h1', { from: inDays(3), to: inDays(1) })).toEqual([]);
	});
});
