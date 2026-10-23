import { describe, expect, it } from 'vitest';
import {
	completePasswordReset,
	createPasswordReset,
	endSessions,
	findPasswordReset,
	hashToken,
	isValidEmail,
	normaliseEmail
} from './account';
import { d1, sqliteWithSchema } from './test-d1';

function setup() {
	const sqlite = sqliteWithSchema();
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('org', 'Venue', 'venue');
		INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('owner', 'o@x.sk', 'old', 'O', 'W');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
		  VALUES ('client', 'c@x.sk', 'old', 'C', 'L', 'client', 'org');
		INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', 'owner', '2999-01-01T00:00:00.000Z');
		INSERT INTO sessions (id, user_id, expires_at) VALUES ('s2', 'owner', '2999-01-01T00:00:00.000Z');
	`);
	return { sqlite, db: d1(sqlite) };
}

describe('email format', () => {
	it('accepts ordinary addresses and refuses obvious junk', () => {
		expect(isValidEmail('jan.novak@example.sk')).toBe(true);
		expect(isValidEmail('x-bad')).toBe(false);
		expect(isValidEmail('a@b')).toBe(false);
		expect(isValidEmail('a b@c.sk')).toBe(false);
		expect(isValidEmail('a@b.')).toBe(false);
		expect(normaliseEmail('  Jan@Example.SK ')).toBe('jan@example.sk');
	});
});

describe('password resets', () => {
	it('stores only the hash of the mailed token', async () => {
		const { sqlite, db } = setup();
		const token = await createPasswordReset(db, 'owner');
		const row = sqlite.prepare('SELECT token FROM password_resets').get() as { token: string };
		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect(row.token).not.toBe(token);
		expect(row.token).toBe(await hashToken(token));
		expect(await findPasswordReset(db, token, { kind: 'apex' })).toMatchObject({ user_id: 'owner' });
		// The stored hash itself is not a working link.
		expect(await findPasswordReset(db, row.token, { kind: 'apex' })).toBeNull();
	});

	it('still honours a link mailed before hashing, for its remaining hour', async () => {
		const { sqlite, db } = setup();
		const legacy = 'a'.repeat(32);
		sqlite.prepare("INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ('r', 'owner', ?, ?)")
			.run(legacy, new Date(Date.now() + 60_000).toISOString());
		expect(await findPasswordReset(db, legacy, { kind: 'apex' })).toMatchObject({ id: 'r' });
	});

	it('keeps apex and venue links apart', async () => {
		const { db } = setup();
		const clientToken = await createPasswordReset(db, 'client');
		expect(await findPasswordReset(db, clientToken, { kind: 'apex' })).toBeNull();
		expect(await findPasswordReset(db, clientToken, { kind: 'client', orgId: 'other' })).toBeNull();
		expect(await findPasswordReset(db, clientToken, { kind: 'client', orgId: 'org' })).toMatchObject({ user_id: 'client' });
	});

	it('refuses an expired link', async () => {
		const { db } = setup();
		const token = await createPasswordReset(db, 'owner', Date.now() - 2 * 60 * 60 * 1000);
		expect(await findPasswordReset(db, token, { kind: 'apex' })).toBeNull();
	});

	it('a completed reset spends every link and signs the account out everywhere', async () => {
		const { sqlite, db } = setup();
		const first = await createPasswordReset(db, 'owner');
		const second = await createPasswordReset(db, 'owner');
		const reset = (await findPasswordReset(db, first, { kind: 'apex' }))!;

		expect(await completePasswordReset(db, reset, 'new-hash')).toBe(true);
		expect(sqlite.prepare("SELECT password_hash FROM users WHERE id = 'owner'").get()).toMatchObject({ password_hash: 'new-hash' });
		expect(await findPasswordReset(db, second, { kind: 'apex' })).toBeNull();
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'owner'").get()).toMatchObject({ n: 0 });
		// The same link cannot be redeemed twice, even by a request already past the lookup.
		expect(await completePasswordReset(db, reset, 'other-hash')).toBe(false);
		expect(sqlite.prepare("SELECT password_hash FROM users WHERE id = 'owner'").get()).toMatchObject({ password_hash: 'new-hash' });
	});

	it('can keep the session that changed the password', async () => {
		const { sqlite, db } = setup();
		await endSessions(db, 'owner', 's1');
		expect(sqlite.prepare("SELECT id FROM sessions WHERE user_id = 'owner'").all()).toEqual([{ id: 's1' }]);
	});
});
