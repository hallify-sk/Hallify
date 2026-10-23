import { describe, expect, it } from 'vitest';
import { isUpcoming, listAccountBookings } from './account-bookings';
import { newOwnerEmail } from './account-deletion-live';
import { d1, migratedSqlite } from './test-d1';

describe('bookings across venues', () => {
	it('lists the account\'s own and its linked venue rows\' bookings, each where it opens', async () => {
		const sqlite = migratedSqlite();
		sqlite.exec(`
			INSERT INTO organizations (id, name, slug) VALUES ('v1', 'Kaštieľ', 'kastiel'), ('v2', 'Mlyn', 'mlyn');
			INSERT INTO halls (id, org_id, name) VALUES ('h1', 'v1', 'Sála'), ('h2', 'v2', 'Stodola');
			INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('acc', 'j@x.sk', 'h', 'J', 'N');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id) VALUES
			  ('c1', 'j@x.sk', '!linked', 'J', 'N', 'client', 'v1', 'acc'),
			  ('c2', 'j@x.sk', '!linked', 'J', 'N', 'client', 'v2', 'acc');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id) VALUES
			  ('stranger', 'other@x.sk', 'h', 'J', 'N', 'client', 'v2');
			INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES
			  ('r1', 'v1', 'h1', 'c1', 'Svadba', '2099-06-01', 'approved', 'a'),
			  ('r2', 'v2', 'h2', 'c2', 'Oslava', '2020-06-01', 'completed', 'b'),
			  ('r3', 'v1', 'h1', 'acc', 'Firemná', '2099-07-01', 'pending', 'c'),
			  ('r4', 'v2', 'h2', 'stranger', 'Cudzia', '2099-08-01', 'pending', 'd');
		`);
		const rows = await listAccountBookings(d1(sqlite), 'acc', new URL('http://localhost:5173/app/client'));
		expect(rows.map((r) => [r.id, r.org_name, r.href])).toEqual([
			['r3', 'Kaštieľ', '/app/reservation/r3'],
			['r1', 'Kaštieľ', 'http://kastiel.localhost:5173/halls/my-reservations/r1'],
			['r2', 'Mlyn', 'http://mlyn.localhost:5173/halls/my-reservations/r2']
		]);
		expect(rows.filter((r) => isUpcoming(r, '2026-10-23')).map((r) => r.id)).toEqual(['r3', 'r1']);
	});
});

describe('the new-owner email', () => {
	it('names the organisation and the previous owner, escaped, and links the console', () => {
		const { subject, html } = newOwnerEmail('en', 'Mlyn <b>', 'Jana', 'https://hallify.sk/app/billing');
		expect(subject).toBe('You are now the owner of Mlyn <b>');
		expect(html).toContain('Mlyn &lt;b&gt;');
		expect(html).toContain('Jana deleted their Hallify account');
		expect(html).toContain('https://hallify.sk/app/billing');
	});
});
