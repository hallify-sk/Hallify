import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { migratedDatabase, d1 } from './sqlite-d1.testutil';
import { reservationCreatorName } from './reservation-activity';

const open: DatabaseSync[] = [];
afterEach(() => { for (const d of open.splice(0)) d.close(); });

function database() {
	const s = migratedDatabase();
	open.push(s);
	s.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('staff', 'staff@example.com', 'x', 'Petra', 'Recepčná')`);
	s.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('client', 'client@example.com', 'x', 'Ján', 'Klient')`);
	s.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel')`);
	s.exec(`INSERT INTO halls (id, org_id, name) VALUES ('h1', 'org', 'Sála')`);
	s.exec(`INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, invite_code, customer_name)
	        VALUES ('r1', 'org', 'h1', 'client', 'Svadba', '2027-06-01', 'ABCD1234', 'Ján Klient')`);
	return s;
}

describe('reservationCreatorName', () => {
	// REG-reservations: once a phone booking is assigned, its owner is the client and
	// the staff member who entered it has to come from the history.
	it('names who entered the booking, by their current name', async () => {
		const s = database();
		s.exec(`INSERT INTO reservation_activity (id, reservation_id, org_id, actor_id, actor_name, kind, created_at)
		        VALUES ('a1', 'r1', 'org', 'staff', 'Old name', 'created', '2026-10-01 10:00:00'),
		               ('a2', 'r1', 'org', 'staff', 'Petra Recepčná', 'assigned', '2026-10-02 10:00:00')`);
		expect(await reservationCreatorName(d1(s), 'r1')).toBe('Petra Recepčná');
	});

	it('falls back to the recorded name of a deleted account, and to null', async () => {
		const s = database();
		expect(await reservationCreatorName(d1(s), 'r1')).toBeNull();
		s.exec(`INSERT INTO reservation_activity (id, reservation_id, org_id, actor_id, actor_name, kind)
		        VALUES ('a1', 'r1', 'org', NULL, 'Bývalý kolega', 'created')`);
		expect(await reservationCreatorName(d1(s), 'r1')).toBe('Bývalý kolega');
	});
});
