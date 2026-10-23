import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { migratedDatabase, d1 } from './sqlite-d1.testutil';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const { settle, grantPurchase, ledgerActivity } = await import('./ai/credits');
const { createSetupRequest, cancelSetupRequest, openSetupRequest } = await import('./setup-requests');
const { planUsage } = await import('./plan-usage');

const open: DatabaseSync[] = [];
afterEach(() => { for (const d of open.splice(0)) d.close(); });

function database() {
	const s = migratedDatabase();
	open.push(s);
	s.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('u1', 'owner@example.com', 'x', 'Olga', 'Owner')`);
	s.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel')`);
	s.exec(`INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m1', 'org', 'u1', 'owner')`);
	s.exec(`INSERT INTO ai_accounts (org_id, balance_mc) VALUES ('org', 100000)`);
	s.exec(`INSERT INTO ai_threads (id, org_id, user_id, title) VALUES ('t1', 'org', 'u1', 'Import the guest list')`);
	return s;
}

const charge = (mc: number, turnId: string | null, threadId: string | null = 't1') => ({
	mc, userId: 'u1', feature: 'chat', model: 'm', inputTokens: 1, cachedTokens: 0, outputTokens: 1, costUsdMicro: 1, threadId, turnId
});

describe('AI credit activity (I4)', () => {
	it('shows one row per question, with its conversation', async () => {
		const s = database(); const db = d1(s);
		await settle(db, 'org', 0, charge(300, 'turn-a'));
		await settle(db, 'org', 0, charge(200, 'turn-a'));
		await settle(db, 'org', 0, charge(100, 'turn-b'));
		await grantPurchase(db, 'org', 50, 'cs_1', 'u1');
		const rows = await ledgerActivity(db, 'org');
		expect(rows).toHaveLength(3);
		const a = rows.find((r) => r.calls === 2)!;
		expect(a).toMatchObject({ amount_mc: -500, thread_id: 't1', thread_title: 'Import the guest list', thread_user_id: 'u1' });
		expect(rows.some((r) => r.kind === 'purchase' && r.amount_mc === 50_000)).toBe(true);
	});

	it('limits to the current period when asked', async () => {
		const s = database(); const db = d1(s);
		await settle(db, 'org', 0, charge(100, 'old'));
		s.exec(`UPDATE ai_ledger SET created_at = '2020-01-01 10:00:00'`);
		await settle(db, 'org', 0, charge(100, 'new'));
		expect(await ledgerActivity(db, 'org', { since: '2026-01-01T00:00:00.000Z' })).toHaveLength(1);
		expect(await ledgerActivity(db, 'org')).toHaveLength(2);
	});
});

describe('setup request (M29)', () => {
	const locals = (db: App.Locals['db']) => ({
		db, locale: 'sk', user: { id: 'u1', email: 'owner@example.com', first_name: 'Olga', last_name: 'Owner' }
	}) as unknown as App.Locals;
	const org = { id: 'org', name: 'Kaštieľ', role: 'owner' } as never;

	it('confirms to the requester, and can be withdrawn', async () => {
		const s = database(); const db = d1(s);
		await createSetupRequest(locals(db), org, '  three venues  ');
		const req = await openSetupRequest(db, 'org');
		expect(req).toMatchObject({ status: 'requested', note: 'three venues', price_cents: 10_000 });
		const mails = s.prepare('SELECT recipient, template FROM email_log ORDER BY rowid').all() as Array<Record<string, string>>;
		expect(mails.map((m) => m.template)).toEqual(['setup-request', 'setup-request-confirmation']);
		expect(mails[1].recipient).toBe('owner@example.com');

		expect(await cancelSetupRequest(locals(db), org)).toBe(true);
		expect(await openSetupRequest(db, 'org')).toBeNull();
	});

	it('cannot be withdrawn once work has started', async () => {
		const s = database(); const db = d1(s);
		await createSetupRequest(locals(db), org, '');
		s.exec(`UPDATE setup_requests SET status = 'in_progress'`);
		expect(await cancelSetupRequest(locals(db), org)).toBe(false);
	});
});

describe('plan usage (M16)', () => {
	it('counts against the per-venue limits by the busiest venue', async () => {
		const s = database(); const db = d1(s);
		s.exec(`INSERT INTO halls (id, org_id, name, gallery_images) VALUES ('h1', 'org', 'A', '["a","b","c"]'), ('h2', 'org', 'B', 'not json')`);
		s.exec(`INSERT INTO hall_extras (id, hall_id, name) VALUES ('e1', 'h1', 'x'), ('e2', 'h1', 'y'), ('e3', 'h2', 'z')`);
		const u = await planUsage(db, 'org');
		expect(u).toMatchObject({ activeHalls: 2, lockedHalls: 0, members: 1, galleryMax: 3, extrasMax: 2, reservationsMax: 0 });
	});
});
