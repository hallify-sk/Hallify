import { describe, expect, it } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { getSessionUser } from './auth';
import { runCleanup } from './cleanup';
import { d1, sqliteWithSchema } from './server/test-d1';

const cookie = (id: string) => ({ get: () => id }) as unknown as Cookies;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

function setup() {
	const sqlite = sqliteWithSchema(['0002_rate_limits.sql']);
	sqlite.exec("INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('u', 'u@x.sk', 'h', 'U', 'S')");
	const add = sqlite.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 'u', ?)");
	add.run('expired', iso(-20 * 60 * 1000)); // twenty minutes ago — usually the same UTC day
	add.run('live', iso(20 * 60 * 1000));
	return { sqlite, db: d1(sqlite) };
}

describe('session expiry', () => {
	it('an ISO expires_at earlier today is expired, not valid until midnight', async () => {
		const { db } = setup();
		expect(await getSessionUser(cookie('expired'), db)).toBeNull();
		expect(await getSessionUser(cookie('live'), db)).toMatchObject({ id: 'u', sessionId: 'live' });
	});

	it('cleanup reaps it the same way', async () => {
		const { sqlite, db } = setup();
		await runCleanup(db);
		expect(sqlite.prepare('SELECT id FROM sessions').all()).toEqual([{ id: 'live' }]);
	});
});
