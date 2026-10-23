import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { testD1 } from './test-d1';
import { loadClientCard, loadClientList, reservationClientKey, saveClientNotes } from './clients';
import { saveFeedback } from './feedback';

let db: D1Database;
let exec: (sql: string) => void;
const today = '2026-10-23';

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel'), ('other', 'Iná', 'ina');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id) VALUES
		  ('jana', 'jana@x.sk', 'x', 'Jana', 'Nová', 'client', 'org'),
		  ('new', 'new@x.sk', 'x', 'Nový', 'Klient', 'client', 'org'),
		  ('elsewhere', 'el@x.sk', 'x', 'Iný', 'Klient', 'client', 'other'),
		  ('staff', 'staff@x.sk', 'x', 'Sta', 'Ff', 'organization', NULL);
		INSERT INTO halls (id, org_id, name) VALUES ('hall', 'org', 'Veľká sála'), ('h2', 'other', 'Iná sála');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code, customer_name, customer_contact) VALUES
		  ('r1', 'org', 'hall', 'jana', 'Svadba', '2026-06-01', 'completed', 'A', NULL, NULL),
		  ('r2', 'org', 'hall', 'jana', 'Krst', '2026-12-01', 'approved', 'B', NULL, NULL),
		  ('r3', 'org', 'hall', 'staff', 'Oslava', '2026-11-11', 'approved', 'C', 'Ján Horváth', '+421 905 123 456'),
		  ('r4', 'org', 'hall', 'staff', 'Porada', '2026-11-12', 'approved', 'D', NULL, NULL),
		  ('r5', 'other', 'h2', 'elsewhere', 'Cudzia', '2026-11-12', 'approved', 'E', NULL, NULL);
		INSERT INTO tickets (id, org_id, user_id, reservation_id, subject) VALUES ('t1', 'org', 'jana', 'r2', 'Krst');
		INSERT INTO messages (id, ticket_id, sender_id, body) VALUES ('m1', 't1', 'jana', 'Dobrý deň'), ('m2', 't1', 'staff', 'Ahoj');
	`);
});

describe('client list (D10)', () => {
	it('lists the venue\'s accounts and phone-booking guests, nobody else', async () => {
		const list = await loadClientList(db, 'org', today);
		expect(list.map((c) => c.name).sort()).toEqual(['Jana Nová', 'Ján Horváth', 'Nový Klient']);
		const jana = list.find((c) => c.userId === 'jana')!;
		expect(jana.bookings).toBe(2);
		expect(jana.nextEvent).toBe('2026-12-01');
		expect(jana.lastEvent).toBe('2026-06-01');
	});

	it('counts the client\'s ratings', async () => {
		await saveFeedback(db, { reservationId: 'r1', orgId: 'org', hallId: 'hall', userId: 'jana', rating: 4, comment: 'Pekné' });
		const jana = (await loadClientList(db, 'org', today)).find((c) => c.userId === 'jana')!;
		expect(jana.ratingAverage).toBe(4);
	});

	it('opens a card with events, conversations, feedback and notes', async () => {
		await saveFeedback(db, { reservationId: 'r1', orgId: 'org', hallId: 'hall', userId: 'jana', rating: 5, comment: null });
		await saveClientNotes(db, 'org', 'u:jana', { phone: '+421 900 111 222', notes: 'VIP' }, 'staff');
		const card = (await loadClientCard(db, 'org', 'u:jana', today))!;
		expect(card.bookings.map((b) => b.id)).toEqual(['r2', 'r1']);
		expect(card.upcoming).toBe(1);
		expect(card.completed).toBe(1);
		expect(card.threads).toHaveLength(1);
		expect(card.threads[0].message_count).toBe(2);
		expect(card.feedback).toHaveLength(1);
		expect(card.notes?.notes).toBe('VIP');
		expect(card.notes?.updated_by_name).toBe('Sta Ff');
		expect(card.client.phone).toBe('+421 900 111 222');

		// Saving again replaces the notes.
		await saveClientNotes(db, 'org', 'u:jana', { phone: null, notes: null }, 'staff');
		expect((await loadClientCard(db, 'org', 'u:jana', today))!.notes?.notes).toBeNull();
	});

	it('opens a guest\'s card by their key, and no card of another venue', async () => {
		const guest = (await loadClientCard(db, 'org', 'p:421905123456', today))!;
		expect(guest.client.kind).toBe('guest');
		expect(guest.bookings.map((b) => b.id)).toEqual(['r3']);
		expect(await loadClientCard(db, 'org', 'u:elsewhere', today)).toBeNull();
		expect(await loadClientCard(db, 'other', 'u:jana', today)).toBeNull();
	});

	it('links a booking to its client, and a team member\'s own event to nobody', async () => {
		expect(await reservationClientKey(db, 'org', 'r2')).toBe('u:jana');
		expect(await reservationClientKey(db, 'org', 'r3')).toBe('p:421905123456');
		expect(await reservationClientKey(db, 'org', 'r4')).toBeNull();
		expect(await reservationClientKey(db, 'org', 'r5')).toBeNull();
	});

	it('files a pending invitation under an existing account with that email', async () => {
		exec(`INSERT INTO reservation_invites (id, reservation_id, org_id, email, first_name, last_name, token, expires_at)
		      VALUES ('i1', 'r4', 'org', 'NEW@x.sk', 'Nový', 'Klient', 'tok', '2030-01-01')`);
		expect(await reservationClientKey(db, 'org', 'r4')).toBe('u:new');
		const card = (await loadClientCard(db, 'org', 'u:new', today))!;
		expect(card.bookings.map((b) => b.id)).toEqual(['r4']);
	});
});
