import { describe, expect, it } from 'vitest';
import { deleteAccount, deletedEmail, planAccountDeletion, type DeletionDeps } from './account-deletion';
import { d1, migratedSqlite } from './test-d1';

type Sqlite = ReturnType<typeof migratedSqlite>;

function setup() {
	const sqlite = migratedSqlite();
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('team', 'Team Venue', 'team'), ('solo', 'Solo Venue', 'solo'), ('other', 'Other Venue', 'other');
		INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES
		  ('me', 'me@x.sk', 'h', 'Mária', 'Ja'),
		  ('admin', 'admin@x.sk', 'h', 'Adam', 'Admin'),
		  ('member', 'member@x.sk', 'h', 'Mia', 'Member'),
		  ('boss', 'boss@x.sk', 'h', 'Boris', 'Boss');
		INSERT INTO organization_members (id, org_id, user_id, role, joined_at) VALUES
		  ('m1', 'team', 'me', 'owner', '2026-01-01'),
		  ('m2', 'team', 'member', 'member', '2026-01-02'),
		  ('m3', 'team', 'admin', 'admin', '2026-03-01'),
		  ('m4', 'solo', 'me', 'owner', '2026-01-01'),
		  ('m5', 'other', 'boss', 'owner', '2026-01-01'),
		  ('m6', 'other', 'me', 'admin', '2026-02-01');
		INSERT INTO subscriptions (id, org_id, plan, status, stripe_subscription_id) VALUES ('s1', 'team', 'starter', 'active', 'sub_team');
		INSERT INTO halls (id, org_id, name, is_public) VALUES ('h1', 'team', 'Sála', 1), ('h2', 'other', 'Iná', 1);
		-- My venue row at 'other', linked to my account, with one upcoming and one past booking.
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id)
		  VALUES ('myclient', 'me@x.sk', '!linked', 'Mária', 'Ja', 'client', 'other', 'me');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code) VALUES
		  ('future', 'other', 'h2', 'myclient', 'Oslava', '2099-05-01', 'approved', 'c1'),
		  ('past', 'other', 'h2', 'myclient', 'Minulá', '2020-05-01', 'completed', 'c2');
		INSERT INTO sessions (id, user_id, expires_at) VALUES ('sa', 'me', '2999-01-01'), ('sb', 'myclient', '2999-01-01');
	`);
	return { sqlite, db: d1(sqlite) };
}

function fakeDeps(overrides: Partial<DeletionDeps> = {}) {
	const calls = { ended: [] as string[], closed: [] as string[], owners: [] as string[], cancelled: [] as string[] };
	const deps: DeletionDeps = {
		endSubscription: async (id) => { calls.ended.push(id); },
		closeOrg: async (id) => { calls.closed.push(id); },
		notifyNewOwner: async (o) => { calls.owners.push(`${o.orgName}:${o.to.email}:${o.previousOwner}`); },
		notifyCancelled: async (b) => { calls.cancelled.push(`${b.id}:${b.guestName}`); },
		today: '2026-10-23',
		...overrides
	};
	return { deps, calls };
}

const user = (sqlite: Sqlite, id: string) => sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;

describe('what deleting an account would do', () => {
	it('hands an owned team to its first admin, closes a one-person org, leaves the rest', async () => {
		const { db } = setup();
		const plan = (await planAccountDeletion(db, 'me', '2026-10-23'))!;
		expect(plan.refused).toBeNull();
		expect(plan.orgs).toEqual([
			{ orgId: 'team', name: 'Team Venue', outcome: 'handOver', newOwner: { id: 'admin', name: 'Adam Admin', email: 'admin@x.sk', locale: null } },
			{ orgId: 'solo', name: 'Solo Venue', outcome: 'close' },
			{ orgId: 'other', name: 'Other Venue', outcome: 'leave' }
		]);
		expect(plan).toMatchObject({ upcoming: 1, past: 1 });
	});

	it('picks the earliest member when there is no admin, and keeps a co-owned org', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`UPDATE organization_members SET role = 'member' WHERE id = 'm3';
			INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m7', 'solo', 'boss', 'owner')`);
		const plan = (await planAccountDeletion(db, 'me'))!;
		expect(plan.orgs[0]).toMatchObject({ outcome: 'handOver', newOwner: { id: 'member' } });
		expect(plan.orgs[1]).toMatchObject({ orgId: 'solo', outcome: 'coOwner' });
	});

	it('refuses the last platform admin', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`UPDATE users SET is_platform_admin = 1 WHERE id = 'me'`);
		expect((await planAccountDeletion(db, 'me'))!.refused).toBe('lastPlatformAdmin');
		const { deps } = fakeDeps();
		expect(await deleteAccount(db, 'me', deps)).toEqual({ ok: false, reason: 'lastPlatformAdmin' });
		sqlite.exec(`UPDATE users SET is_platform_admin = 1 WHERE id = 'boss'`);
		expect((await planAccountDeletion(db, 'me'))!.refused).toBeNull();
	});
});

describe('deleting an account', () => {
	it('hands over, closes, cancels upcoming bookings and anonymises what the venue keeps', async () => {
		const { sqlite, db } = setup();
		const { deps, calls } = fakeDeps();
		const result = await deleteAccount(db, 'me', deps);
		expect(result).toMatchObject({ ok: true, cancelled: 1, closed: ['Solo Venue'], handedOver: ['Team Venue'] });

		expect(calls.ended).toEqual(['sub_team']);
		expect(calls.closed).toEqual(['solo']);
		expect(calls.owners).toEqual(['Team Venue:admin@x.sk:Mária Ja']);
		expect(calls.cancelled).toEqual(['future:Mária Ja']);

		expect(sqlite.prepare(`SELECT user_id, role FROM organization_members WHERE org_id = 'team' ORDER BY user_id`).all())
			.toEqual([{ user_id: 'admin', role: 'owner' }, { user_id: 'member', role: 'member' }]);
		expect(sqlite.prepare(`SELECT is_public FROM halls WHERE id = 'h1'`).get()).toEqual({ is_public: 0 });
		expect(sqlite.prepare(`SELECT is_public FROM halls WHERE id = 'h2'`).get()).toEqual({ is_public: 1 });
		expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM organization_members WHERE user_id = 'me'`).get()).toEqual({ n: 0 });

		expect(sqlite.prepare(`SELECT id, status, cancelled_by FROM reservations ORDER BY id`).all()).toEqual([
			{ id: 'future', status: 'cancelled', cancelled_by: 'client' },
			{ id: 'past', status: 'completed', cancelled_by: null }
		]);
		// The venue row is kept for the bookings, without the person.
		expect(user(sqlite, 'myclient')).toMatchObject({
			email: deletedEmail('myclient'), first_name: 'Zmazaný', password_hash: '!deleted', account_id: null
		});
		expect(user(sqlite, 'myclient')!.deleted_at).not.toBeNull();
		// The account had nothing pointing at it: gone, with its sessions.
		expect(user(sqlite, 'me')).toBeUndefined();
		expect(sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
	});

	it('anonymises the account instead when records still point at it', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO organization_invites (id, org_id, email, token, invited_by, expires_at)
			VALUES ('i1', 'team', 'new@x.sk', 't', 'me', '2999-01-01')`);
		const { deps } = fakeDeps();
		expect(await deleteAccount(db, 'me', deps)).toMatchObject({ ok: true });
		expect(user(sqlite, 'me')).toMatchObject({ email: deletedEmail('me'), first_name: 'Zmazaný', is_platform_admin: 0 });
	});

	it('stops before removing anything when a subscription cannot be stopped', async () => {
		const { sqlite, db } = setup();
		const { deps, calls } = fakeDeps({ endSubscription: async () => { throw new Error('stripe down'); } });
		expect(await deleteAccount(db, 'me', deps)).toEqual({ ok: false, reason: 'billing', org: 'Team Venue' });
		expect(calls.closed).toEqual([]);
		expect(user(sqlite, 'me')).toMatchObject({ email: 'me@x.sk' });
		expect(sqlite.prepare(`SELECT status FROM reservations WHERE id = 'future'`).get()).toEqual({ status: 'approved' });
	});

	it('deletes a venue row without bookings outright', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`DELETE FROM reservations; DELETE FROM organization_members WHERE user_id = 'me';`);
		const { deps } = fakeDeps();
		expect(await deleteAccount(db, 'me', deps)).toMatchObject({ ok: true, cancelled: 0, anonymised: 0 });
		expect(user(sqlite, 'myclient')).toBeUndefined();
		expect(user(sqlite, 'me')).toBeUndefined();
	});
});
