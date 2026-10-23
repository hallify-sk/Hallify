import { describe, expect, it } from 'vitest';
import {
	LINKED_PASSWORD,
	authenticateOnVenue,
	claimClientRows,
	findHallifyAccount,
	registerOnVenue,
	syncLinkedRows,
	verificationTarget
} from './identity';
import { d1, migratedSqlite } from './test-d1';

// bcrypt stand-in: a "hash" is the password with a prefix.
const hash = (p: string) => `h:${p}`;
const compare = async (p: string, h: string) => h === hash(p);

function setup() {
	const sqlite = migratedSqlite();
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('v1', 'Venue One', 'one'), ('v2', 'Venue Two', 'two');
		INSERT INTO users (id, email, password_hash, first_name, last_name, email_verified_at)
		  VALUES ('acc', 'jana@x.sk', '${hash('hallify')}', 'Jana', 'Nová', '2026-01-01 00:00:00');
		INSERT INTO users (id, email, password_hash, first_name, last_name)
		  VALUES ('owner', 'owner@x.sk', '${hash('owner')}', 'O', 'W');
		INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m1', 'v1', 'owner', 'owner');
	`);
	return { sqlite, db: d1(sqlite) };
}

const row = (sqlite: ReturnType<typeof migratedSqlite>, id: string) =>
	sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;

describe('signing in on a venue site', () => {
	it('creates a linked client row on first sign-in with the Hallify account', async () => {
		const { sqlite, db } = setup();
		const r = await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'hallify', compare);
		expect(r).toMatchObject({ kind: 'client', created: true });
		const client = row(sqlite, (r as { userId: string }).userId);
		expect(client).toMatchObject({ account_type: 'client', org_id: 'v1', account_id: 'acc', password_hash: LINKED_PASSWORD, first_name: 'Jana' });
		expect(client.email_verified_at).toBe('2026-01-01 00:00:00');

		// The second time the same row is used, at another venue a new one.
		const again = await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'hallify', compare);
		expect(again).toMatchObject({ kind: 'client', userId: client.id });
		const other = await authenticateOnVenue(db, 'v2', 'jana@x.sk', 'hallify', compare);
		expect(other).toMatchObject({ kind: 'client', created: true });
		expect((other as { userId: string }).userId).not.toBe(client.id);
	});

	it('signs a member of the venue in as staff', async () => {
		const { db } = setup();
		expect(await authenticateOnVenue(db, 'v1', 'owner@x.sk', 'owner', compare)).toEqual({ kind: 'member', userId: 'owner' });
		// Elsewhere the same person is a client.
		expect(await authenticateOnVenue(db, 'v2', 'owner@x.sk', 'owner', compare)).toMatchObject({ kind: 'client', created: true });
	});

	it('refuses a wrong password and never opens a linked row by its own hash', async () => {
		const { db } = setup();
		expect(await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'nope', compare)).toBeNull();
		expect(await authenticateOnVenue(db, 'v1', 'jana@x.sk', LINKED_PASSWORD, async (p, h) => p === h)).toBeNull();
	});

	it('links an old venue account when the same password opens both', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', '${hash('hallify')}', 'J', 'N', 'client', 'v1')`);
		expect(await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'hallify', compare)).toEqual({ kind: 'client', userId: 'old', linked: true });
		expect(row(sqlite, 'old')).toMatchObject({ account_id: 'acc', password_hash: LINKED_PASSWORD });
	});

	it('explains a separate old account with another password, and still lets that password in', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', '${hash('venue')}', 'J', 'N', 'client', 'v1')`);
		expect(await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'hallify', compare)).toEqual({ kind: 'separate', accountId: 'acc' });
		expect(await authenticateOnVenue(db, 'v1', 'jana@x.sk', 'venue', compare)).toEqual({ kind: 'client', userId: 'old' });
		expect(row(sqlite, 'old').account_id).toBeNull();
	});

	it('still signs in a venue-only account without any Hallify account', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('solo', 'solo@x.sk', '${hash('pw')}', 'S', 'O', 'client', 'v2')`);
		expect(await authenticateOnVenue(db, 'v2', 'solo@x.sk', 'pw', compare)).toEqual({ kind: 'client', userId: 'solo' });
		expect(await authenticateOnVenue(db, 'v1', 'solo@x.sk', 'pw', compare)).toBeNull();
	});
});

describe('registering on a venue site', () => {
	it('creates the Hallify account and the linked client row together, unverified', async () => {
		const { sqlite, db } = setup();
		const r = await registerOnVenue(db, 'v2', { email: 'new@x.sk', passwordHash: hash('pw'), firstName: 'N', lastName: 'W' });
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect(row(sqlite, r.accountId)).toMatchObject({ org_id: null, account_type: 'organization', email_verified_at: null });
		expect(row(sqlite, r.clientId)).toMatchObject({ org_id: 'v2', account_id: r.accountId });
		// The same credentials now work at another venue.
		expect(await authenticateOnVenue(db, 'v1', 'new@x.sk', 'pw', compare)).toMatchObject({ kind: 'client', created: true });
	});

	it('sends an address with a Hallify account to sign in instead', async () => {
		const { db } = setup();
		expect(await registerOnVenue(db, 'v2', { email: 'jana@x.sk', passwordHash: hash('x'), firstName: 'J', lastName: 'N' }))
			.toEqual({ ok: false, reason: 'hasAccount' });
	});

	it('refuses an address the venue already has a client for', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'old@x.sk', 'h', 'O', 'L', 'client', 'v2')`);
		expect(await registerOnVenue(db, 'v2', { email: 'old@x.sk', passwordHash: hash('x'), firstName: 'O', lastName: 'L' }))
			.toEqual({ ok: false, reason: 'clientExists' });
	});
});

describe('claiming and keeping linked rows in step', () => {
	it('claims every unlinked client row with the address and ends their sessions', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			  VALUES ('c1', 'jana@x.sk', 'h1', 'J', 'N', 'client', 'v1'), ('c2', 'jana@x.sk', 'h2', 'J', 'N', 'client', 'v2'),
			         ('c3', 'else@x.sk', 'h3', 'E', 'L', 'client', 'v2');
			INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', 'c1', '2999-01-01T00:00:00.000Z');
		`);
		const account = (await findHallifyAccount(db, 'jana@x.sk'))!;
		expect(await claimClientRows(db, account)).toBe(2);
		expect(row(sqlite, 'c1').account_id).toBe('acc');
		expect(row(sqlite, 'c2').account_id).toBe('acc');
		expect(row(sqlite, 'c3').account_id).toBeNull();
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'c1'").get()).toMatchObject({ n: 0 });
	});

	it('copies name, email and verification to linked rows, skipping a clash at one venue', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id)
			  VALUES ('l1', 'jana@x.sk', '!linked', 'J', 'N', 'client', 'v1', 'acc'), ('l2', 'jana@x.sk', '!linked', 'J', 'N', 'client', 'v2', 'acc');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			  VALUES ('clash', 'new@x.sk', 'h', 'C', 'L', 'client', 'v2');
		`);
		await syncLinkedRows(db, 'acc', { firstName: 'Janka', lastName: 'Stará', email: 'new@x.sk', emailVerifiedAt: null });
		expect(row(sqlite, 'l1')).toMatchObject({ first_name: 'Janka', email: 'new@x.sk', email_verified_at: null });
		expect(row(sqlite, 'l2')).toMatchObject({ first_name: 'Janka', email: 'jana@x.sk' });
	});

	it('answers verification for a linked row with its Hallify account', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id)
			VALUES ('l1', 'jana@x.sk', '!linked', 'J', 'N', 'client', 'v1', 'acc')`);
		expect(await verificationTarget(db, 'l1')).toMatchObject({ id: 'acc', org_id: null });
		expect(await verificationTarget(db, 'owner')).toMatchObject({ id: 'owner' });
	});
});
