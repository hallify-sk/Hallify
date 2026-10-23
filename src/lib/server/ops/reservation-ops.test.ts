import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

// No e-mail or webhook leaves a test run.
vi.mock('$lib/email', async (importOriginal) => ({
	reservationChanges: (await importOriginal<typeof import('$lib/email')>()).reservationChanges,
	notifyStatusChange: vi.fn(async () => {}),
	notifyNewMessage: vi.fn(async () => {}),
	notifyHallCancellation: vi.fn(async () => {}),
	notifyVenueChange: vi.fn(async () => true),
}));
vi.mock('$lib/server/reminders', () => ({ clearReminder: vi.fn(async () => {}) }));
vi.mock('$lib/server/cap-notices', () => ({ noteMonthUsage: vi.fn(async () => {}) }));
vi.mock('$lib/notifications', () => ({ dispatchWebhooks: vi.fn(async () => {}) }));

import { testD1 } from '../test-d1';
import { changeReservationStatus, editReservationDetails, messageReservationClient, setReservationExtras } from './reservation-ops';
import { notifyHallCancellation, notifyStatusChange, notifyVenueChange } from '$lib/email';

let db: D1Database;
let exec: (sql: string) => void;
const actor = { id: 'staff', first_name: 'Sta', last_name: 'Ff' };
const locals = () => ({ db, locale: 'sk' }) as unknown as App.Locals;
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

beforeEach(async () => {
	vi.clearAllMocks();
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Org', 'org');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type) VALUES
		  ('client', 'c@x.sk', 'x', 'Cli', 'Ent', 'client'), ('staff', 's@x.sk', 'x', 'Sta', 'Ff', 'organization');
		INSERT INTO halls (id, org_id, name, max_people, allow_reservations) VALUES ('h1', 'o1', 'Sála', 100, 1);
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES
		  ('r1', 'o1', 'h1', 'client', 'Svadba', '${future(30)}', 'pending', 'A'),
		  ('r2', 'o1', 'h1', 'client', 'Iná', '${future(40)}', 'approved', 'B'),
		  ('old', 'o1', 'h1', 'client', 'Stará', '2020-01-01', 'pending', 'C');
	`);
});

const row = (id: string) => db.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first<Record<string, unknown>>();

describe('changeReservationStatus', () => {
	it('refuses a change made from a stale view', async () => {
		const res = await changeReservationStatus(locals(), 'o1', 'r1', 'approved', actor, { expectedFrom: 'approved' });
		expect(res.ok).toBe(false);
		expect((await row('r1'))?.status).toBe('pending');
	});

	it('approves, logs the history and e-mails the client', async () => {
		const res = await changeReservationStatus(locals(), 'o1', 'r1', 'approved', actor, { expectedFrom: 'pending' });
		expect(res.ok).toBe(true);
		expect((await row('r1'))?.status).toBe('approved');
		expect(notifyStatusChange).toHaveBeenCalledOnce();
		const act = await db.prepare("SELECT kind, status FROM reservation_activity WHERE reservation_id = 'r1'").first();
		expect(act).toMatchObject({ kind: 'status', status: 'approved' });
	});

	it('declines with a reason the client sees in the thread and the e-mail', async () => {
		const res = await changeReservationStatus(locals(), 'o1', 'r1', 'cancelled', actor, { reason: 'Obsadené.' });
		expect(res.ok).toBe(true);
		expect(await row('r1')).toMatchObject({ status: 'cancelled', status_reason: 'Obsadené.', cancelled_by: 'venue' });
		expect(notifyHallCancellation).toHaveBeenCalledOnce();
		expect(notifyStatusChange).not.toHaveBeenCalled();
		const msg = await db.prepare(`SELECT m.body FROM messages m JOIN tickets t ON t.id = m.ticket_id WHERE t.reservation_id = 'r1'`).first();
		expect(msg).toMatchObject({ body: 'Obsadené.' });
	});

	it('will not complete a future event or approve a passed request', async () => {
		expect((await changeReservationStatus(locals(), 'o1', 'r2', 'completed', actor)).ok).toBe(false);
		expect((await changeReservationStatus(locals(), 'o1', 'old', 'approved', actor)).ok).toBe(false);
	});

	it('does nothing (and e-mails nobody) when the status is unchanged', async () => {
		expect((await changeReservationStatus(locals(), 'o1', 'r1', 'pending', actor)).ok).toBe(true);
		expect(notifyStatusChange).not.toHaveBeenCalled();
	});
});

describe('editReservationDetails', () => {
	const base = { startTime: '18:00', endTime: '', numGuests: '50', description: 'Pre klienta', internalNotes: 'Len pre tím' };

	it('moves a booking to a free date and records what changed', async () => {
		const res = await editReservationDetails(locals(), 'o1', 'r1', { ...base, eventDate: future(31) }, actor);
		expect(res.ok).toBe(true);
		expect(await row('r1')).toMatchObject({ event_date: future(31), start_time: '18:00', num_guests: 50, internal_notes: 'Len pre tím' });
		// The client hears what changed, but not about the internal note (M4).
		const changes = vi.mocked(notifyVenueChange).mock.calls[0][3];
		expect(changes.map((c) => c.field)).toEqual(['date', 'startTime', 'guests', 'description']);
	});

	it('refuses a date another booking holds, and too many guests', async () => {
		expect((await editReservationDetails(locals(), 'o1', 'r1', { ...base, eventDate: future(40) }, actor)).ok).toBe(false);
		expect((await editReservationDetails(locals(), 'o1', 'r1', { ...base, eventDate: future(30), numGuests: '500' }, actor)).ok).toBe(false);
	});
});

describe('messageReservationClient', () => {
	it('keeps one thread per booking', async () => {
		await Promise.all([
			messageReservationClient(locals(), 'o1', 'r1', 'a', actor),
			messageReservationClient(locals(), 'o1', 'r1', 'b', actor),
		]);
		const n = await db.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE reservation_id = 'r1'`).first<{ n: number }>();
		expect(n?.n).toBe(1);
	});
});

describe('setReservationExtras (price snapshot, I8)', () => {
	const snap = async (id: string) =>
		JSON.parse(String((await row(id))?.extras_snapshot_json ?? '[]')) as Array<{ id: string; price_cents: number }>;

	beforeEach(() => {
		exec(`INSERT INTO hall_extras (id, hall_id, name, price_cents, pricing) VALUES
		  ('x1', 'h1', 'Catering', 2500, 'per_guest'), ('x2', 'h1', 'Projektor', 5000, 'fixed');`);
	});

	it('stores the price each extra was booked at, and keeps it after a price change', async () => {
		expect((await setReservationExtras(db, 'o1', 'r1', ['x1'])).ok).toBe(true);
		expect(await snap('r1')).toMatchObject([{ id: 'x1', price_cents: 2500 }]);

		exec(`UPDATE hall_extras SET price_cents = 9900 WHERE id = 'x1'`);
		await setReservationExtras(db, 'o1', 'r1', ['x1', 'x2']);
		expect((await snap('r1')).map((s) => [s.id, s.price_cents])).toEqual([['x1', 2500], ['x2', 5000]]);
	});

	it('lets a booked extra the hall has since deleted stay on the booking', async () => {
		await setReservationExtras(db, 'o1', 'r1', ['x1', 'x2']);
		exec(`DELETE FROM hall_extras WHERE id = 'x2'`);
		const res = await setReservationExtras(db, 'o1', 'r1', ['x1', 'x2']);
		expect(res.ok && res.kept).toEqual(['x1', 'x2']);
		expect((await snap('r1')).map((s) => s.id)).toEqual(['x1', 'x2']);
	});
});

describe('setReservationExtras by staff (M4)', () => {
	beforeEach(() => {
		exec(`INSERT INTO hall_extras (id, hall_id, name, price_cents, pricing) VALUES ('x1', 'h1', 'Catering', 2500, 'fixed');`);
	});

	it('logs the change and tells the client, old and new total', async () => {
		await setReservationExtras(db, 'o1', 'r1', ['x1'], actor);
		const change = vi.mocked(notifyVenueChange).mock.calls[0][3][0];
		expect(change).toMatchObject({ field: 'extras', from: null, to: 'Catering', fromCents: 0, toCents: 2500 });
		const act = await db.prepare("SELECT kind, note FROM reservation_activity WHERE reservation_id = 'r1'").first();
		expect(act).toMatchObject({ kind: 'edited', note: 'extras' });
	});

	it('stays quiet when nothing changed, or without an actor', async () => {
		await setReservationExtras(db, 'o1', 'r1', ['x1']);
		await setReservationExtras(db, 'o1', 'r1', ['x1'], actor);
		expect(notifyVenueChange).not.toHaveBeenCalled();
	});
});
