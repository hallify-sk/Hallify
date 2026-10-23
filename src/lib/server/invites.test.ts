import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { hasSeatForInvite, inviteLink, isValidInviteEmail, seatsSpokenFor } from './invites';

describe('isValidInviteEmail', () => {
	it('refuses what the report sent', () => {
		expect(isValidInviteEmail('notanemail')).toBe(false);
		expect(isValidInviteEmail('jan@firma')).toBe(false);
		expect(isValidInviteEmail('jan @firma.sk')).toBe(false);
	});

	it('accepts ordinary addresses', () => {
		expect(isValidInviteEmail('jan.novak@kastiel.sk')).toBe(true);
		expect(isValidInviteEmail('a+b@sub.example.com')).toBe(true);
	});
});

describe('hasSeatForInvite', () => {
	it('counts against the cap and treats -1 as unlimited', () => {
		expect(hasSeatForInvite(2, 1)).toBe(true);
		expect(hasSeatForInvite(2, 2)).toBe(false);
		expect(hasSeatForInvite(-1, 999)).toBe(true);
	});
});

describe('inviteLink', () => {
	it('points at the apex acceptance page', () => {
		expect(inviteLink('https://hallify.sk/', 'abc')).toBe('https://hallify.sk/app/invite/abc');
	});
});

describe('seatsSpokenFor', () => {
	const open: DatabaseSync[] = [];
	afterEach(() => {
		for (const d of open.splice(0)) d.close();
	});

	function setup() {
		const sqlite = new DatabaseSync(':memory:');
		open.push(sqlite);
		sqlite.exec(readFileSync(new URL('../../../migrations/0001_baseline.sql', import.meta.url), 'utf8'));
		sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Venue','venue')");
		sqlite.exec("INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('u1','owner@x.sk','h','A','B')");
		sqlite.exec("INSERT INTO organization_members(id,org_id,user_id,role) VALUES ('m1','o1','u1','owner')");
		const db = {
			prepare: (sql: string) => ({
				bind: (...args: unknown[]) => ({
					first: async () => sqlite.prepare(sql).get(...(args as string[])) ?? null
				})
			})
		} as unknown as App.Locals['db'];
		return { sqlite, db };
	}

	const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

	it('counts members plus invites still waiting for an answer', async () => {
		const { sqlite, db } = setup();
		const add = (id: string, email: string, expires: string, accepted: string | null = null) =>
			sqlite
				.prepare(
					'INSERT INTO organization_invites(id,org_id,email,role,token,invited_by,expires_at,accepted_at) VALUES (?,?,?,?,?,?,?,?)'
				)
				.run(id, 'o1', email, 'member', `t-${id}`, 'u1', expires, accepted);
		add('i1', 'pending@x.sk', iso(86_400_000));
		add('i2', 'accepted@x.sk', iso(86_400_000), '2026-10-01 10:00:00');
		// Expired an hour ago, on what is most likely still today: compared as raw
		// text against datetime('now') this one used to count as pending.
		add('i3', 'expired@x.sk', iso(-3_600_000));

		expect(await seatsSpokenFor(db, 'o1')).toBe(2);
		// Re-sending the pending invite does not count it twice.
		expect(await seatsSpokenFor(db, 'o1', 'pending@x.sk')).toBe(1);
	});
});
