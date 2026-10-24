import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { d1, migratedDatabase } from './sqlite-d1.testutil';
import { clientReservationAccess, clientRights, venueClientAccess } from './reservation-client-access';
import {
	acceptMemberInvite, addMemberDirect, dropOwnerMembership, findMemberInvite, inviteMember, listReservationMembers,
	memberEmails, removeMember, renewMemberInvite, MAX_MEMBERS,
} from './reservation-members';
import { listAccountBookings } from './account-bookings';
import { hashToken } from './account';

let sqlite: DatabaseSync;
let db: App.Locals['db'];

// Venue v1 (Kaštieľ) with hall h1; another venue v2. The owner's booking r1, someone
// else's r2. Clients: owner, guest (has a Hallify account), and a stranger.
beforeEach(() => {
	sqlite = migratedDatabase();
	db = d1(sqlite);
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('v1', 'Kaštieľ', 'kastiel'), ('v2', 'Mlyn', 'mlyn');
		INSERT INTO halls (id, org_id, name) VALUES ('h1', 'v1', 'Sála'), ('h2', 'v2', 'Stodola');
		INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('acc', 'guest@x.sk', 'h', 'Gita', 'Hosť');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id) VALUES
		  ('owner', 'owner@x.sk', 'h', 'Olga', 'Majiteľ', 'client', 'v1', NULL),
		  ('guest', 'guest@x.sk', '!linked', 'Gita', 'Hosť', 'client', 'v1', 'acc'),
		  ('guest2', 'guest@x.sk', '!linked', 'Gita', 'Hosť', 'client', 'v2', 'acc'),
		  ('stranger', 'stranger@x.sk', 'h', 'Stano', 'Cudzí', 'client', 'v1', NULL);
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES
		  ('r1', 'v1', 'h1', 'owner', 'Svadba', '2099-06-01', 'approved', 'a'),
		  ('r2', 'v1', 'h1', 'stranger', 'Cudzia', '2099-07-01', 'pending', 'b');
	`);
});

describe('who may open a booking on the venue site', () => {
	it('the owner as owner, an accepted member as member, nobody else', async () => {
		expect(await clientReservationAccess(db, 'r1', 'owner', 'v1')).toBe('owner');
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBeNull();
		expect(await clientReservationAccess(db, 'r1', 'stranger', 'v1')).toBeNull();

		const added = await addMemberDirect(db, { reservationId: 'r1', userId: 'guest', email: 'guest@x.sk', invitedBy: null });
		expect(added.ok).toBe(true);
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBe('member');
		expect(await clientReservationAccess(db, 'r1', 'stranger', 'v1')).toBeNull();
		// Another venue's site never opens it, whoever asks.
		expect(await clientReservationAccess(db, 'r1', 'owner', 'v2')).toBeNull();
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v2')).toBeNull();
	});

	it('a pending invitation gives no access', async () => {
		await inviteMember(db, { reservationId: 'r1', email: 'stranger@x.sk', invitedBy: 'owner' });
		expect(await clientReservationAccess(db, 'r1', 'stranger', 'v1')).toBeNull();
	});

	it('matches a member row held by the same person through the linked Hallify account', async () => {
		// A row bound to the Hallify account itself (not the venue row) still opens it.
		sqlite.exec(`INSERT INTO reservation_members (id, reservation_id, user_id, email, accepted_at)
		             VALUES ('m1', 'r1', 'acc', 'guest@x.sk', datetime('now'))`);
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBe('member');
	});

	it('the list query returns own and shared bookings with their access', async () => {
		await addMemberDirect(db, { reservationId: 'r2', userId: 'owner', email: 'owner@x.sk', invitedBy: null });
		const a = venueClientAccess('owner');
		const rows = sqlite.prepare(
			`SELECT r.id, ${a.access.sql} AS access FROM reservations r WHERE ${a.where.sql} AND r.org_id = ? ORDER BY r.id`
		).all(...a.access.params, ...a.where.params, 'v1');
		expect(rows.map((r) => ({ ...r }))).toEqual([{ id: 'r1', access: 'owner' }, { id: 'r2', access: 'member' }]);
	});

	it('rights: members see, message and seat; only the owner cancels, changes, rates and shares', () => {
		expect(clientRights('member')).toEqual({ view: true, message: true, editLayout: true, cancel: false, editBooking: false, feedback: false, manageMembers: false });
		expect(clientRights('owner')).toEqual({ view: true, message: true, editLayout: true, cancel: true, editBooking: true, feedback: true, manageMembers: true });
		expect(clientRights(null).view).toBe(false);
	});

	it('the cross-venue list on hallify.sk shows shared bookings, marked as such', async () => {
		await addMemberDirect(db, { reservationId: 'r1', userId: 'guest', email: 'guest@x.sk', invitedBy: null });
		const rows = await listAccountBookings(db, 'acc', new URL('http://localhost:5173/app/client'));
		expect(rows.map((r) => [r.id, r.access, r.href])).toEqual([
			['r1', 'member', 'http://kastiel.localhost:5173/halls/my-reservations/r1'],
		]);
		// No client-only columns leak, and the staff-only ones are not selected (B60).
		expect(rows[0]).not.toHaveProperty('internal_notes');
	});
});

describe('adding and removing people', () => {
	it('refuses the owner, a duplicate, and more than the cap', async () => {
		expect(await addMemberDirect(db, { reservationId: 'r1', userId: 'owner', email: 'owner@x.sk', invitedBy: null })).toEqual({ ok: false, reason: 'owner' });
		expect(await inviteMember(db, { reservationId: 'r1', email: 'OWNER@x.sk', invitedBy: null })).toEqual({ ok: false, reason: 'owner' });
		await addMemberDirect(db, { reservationId: 'r1', userId: 'guest', email: 'guest@x.sk', invitedBy: null });
		expect(await inviteMember(db, { reservationId: 'r1', email: 'Guest@X.sk', invitedBy: null })).toEqual({ ok: false, reason: 'already' });
		for (let i = 1; i < MAX_MEMBERS; i++) {
			expect((await inviteMember(db, { reservationId: 'r1', email: `p${i}@x.sk`, invitedBy: null })).ok).toBe(true);
		}
		expect(await inviteMember(db, { reservationId: 'r1', email: 'one-too-many@x.sk', invitedBy: null })).toEqual({ ok: false, reason: 'full' });
	});

	it('stores only the token hash, and a resend replaces the link', async () => {
		const inv = await inviteMember(db, { reservationId: 'r1', email: 'stranger@x.sk', invitedBy: 'owner' });
		if (!inv.ok) throw new Error('not invited');
		const stored = sqlite.prepare('SELECT invite_token FROM reservation_members WHERE id = ?').get(inv.id) as { invite_token: string };
		expect(stored.invite_token).toBe(await hashToken(inv.token));
		expect(stored.invite_token).not.toContain(inv.token);

		const renewed = await renewMemberInvite(db, 'r1', inv.id);
		expect(renewed?.email).toBe('stranger@x.sk');
		expect(await findMemberInvite(db, inv.token)).toBeNull();
		expect((await findMemberInvite(db, renewed!.token))?.reservation_id).toBe('r1');
	});

	it('removing someone takes their access away', async () => {
		const added = await addMemberDirect(db, { reservationId: 'r1', userId: 'guest', email: 'guest@x.sk', invitedBy: null });
		if (!added.ok) throw new Error('not added');
		expect((await listReservationMembers(db, 'r1')).map((m) => [m.email, m.status])).toEqual([['guest@x.sk', 'joined']]);
		expect(await removeMember(db, 'r1', added.id)).toEqual({ email: 'guest@x.sk', name: 'Gita Hosť' });
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBeNull();
		// Another booking's member id does not remove anything here.
		expect(await removeMember(db, 'r2', added.id)).toBeNull();
	});

	it('a member who becomes the owner is no longer also a member; members get the emails', async () => {
		await addMemberDirect(db, { reservationId: 'r1', userId: 'guest', email: 'guest@x.sk', invitedBy: null });
		await inviteMember(db, { reservationId: 'r1', email: 'pending@x.sk', invitedBy: null });
		expect(await memberEmails(db, 'r1', 'owner@x.sk')).toEqual(['guest@x.sk']);
		sqlite.exec(`UPDATE reservations SET user_id = 'guest' WHERE id = 'r1'`);
		await dropOwnerMembership(db, 'r1', 'guest');
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBe('owner');
		expect(await memberEmails(db, 'r1')).toEqual([]);
	});
});

describe('accepting an invitation', () => {
	const asClient = (id: string, email: string, orgId = 'v1') => ({ id, email, account_type: 'client', org_id: orgId });

	it('binds the signed-in client with the invited address, once', async () => {
		const inv = await inviteMember(db, { reservationId: 'r1', email: 'Guest@x.sk', invitedBy: 'owner' });
		if (!inv.ok) throw new Error('not invited');
		const res = await acceptMemberInvite(db, inv.token, asClient('guest', 'guest@x.sk'), 'v1');
		expect(res).toEqual({ ok: true, reservationId: 'r1', memberId: inv.id });
		expect(await clientReservationAccess(db, 'r1', 'guest', 'v1')).toBe('member');
		// Single use: the token is gone.
		expect(await acceptMemberInvite(db, inv.token, asClient('guest', 'guest@x.sk'), 'v1')).toEqual({ ok: false, reason: 'notFound' });
	});

	it('refuses another address: a forwarded link lets nobody else in', async () => {
		const inv = await inviteMember(db, { reservationId: 'r1', email: 'guest@x.sk', invitedBy: 'owner' });
		if (!inv.ok) throw new Error('not invited');
		expect(await acceptMemberInvite(db, inv.token, asClient('stranger', 'stranger@x.sk'), 'v1')).toEqual({ ok: false, reason: 'emailMismatch' });
		expect(await clientReservationAccess(db, 'r1', 'stranger', 'v1')).toBeNull();
		// The invitation still works for the right person.
		expect((await acceptMemberInvite(db, inv.token, asClient('guest', 'guest@x.sk'), 'v1')).ok).toBe(true);
	});

	it('refuses on another venue, as staff, after expiry and on a cancelled event', async () => {
		const inv = await inviteMember(db, { reservationId: 'r1', email: 'guest@x.sk', invitedBy: 'owner' });
		if (!inv.ok) throw new Error('not invited');
		expect(await acceptMemberInvite(db, inv.token, asClient('guest2', 'guest@x.sk', 'v2'), 'v2')).toEqual({ ok: false, reason: 'wrongVenue' });
		expect(await acceptMemberInvite(db, inv.token, { id: 'acc', email: 'guest@x.sk', account_type: 'owner', org_id: null }, 'v1')).toEqual({ ok: false, reason: 'wrongVenue' });

		sqlite.exec(`UPDATE reservation_members SET expires_at = '2000-01-01T00:00:00.000Z'`);
		expect(await acceptMemberInvite(db, inv.token, asClient('guest', 'guest@x.sk'), 'v1')).toEqual({ ok: false, reason: 'expired' });

		sqlite.exec(`UPDATE reservation_members SET expires_at = NULL; UPDATE reservations SET status = 'cancelled' WHERE id = 'r1'`);
		expect(await acceptMemberInvite(db, inv.token, asClient('guest', 'guest@x.sk'), 'v1')).toEqual({ ok: false, reason: 'cancelled' });
	});

	it('the owner opening an invitation to their own address just lands on the booking', async () => {
		sqlite.exec(`UPDATE users SET email = 'olga@x.sk' WHERE id = 'owner'`);
		const inv = await inviteMember(db, { reservationId: 'r1', email: 'later@x.sk', invitedBy: null });
		if (!inv.ok) throw new Error('not invited');
		sqlite.exec(`UPDATE users SET email = 'later@x.sk' WHERE id = 'owner'`);
		expect(await acceptMemberInvite(db, inv.token, asClient('owner', 'later@x.sk'), 'v1')).toEqual({ ok: true, reservationId: 'r1', memberId: null });
		expect(await listReservationMembers(db, 'r1')).toEqual([]);
	});

	it('a malformed token finds nothing', async () => {
		expect(await findMemberInvite(db, "x' OR 1=1 --")).toBeNull();
	});
});
