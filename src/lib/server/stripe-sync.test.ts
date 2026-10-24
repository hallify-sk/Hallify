import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type Stripe from 'stripe';
import { migratedDatabase, d1 } from './sqlite-d1.testutil';

vi.mock('$env/dynamic/private', () => ({ env: { APP_URL: 'https://hallify.test' } }));

const { applySubscription, applyCreditPurchase, handleStripeEvent, skipReason } = await import('./stripe-sync');
const { enforcePlanLimits, swapActiveHall, unlockHall } = await import('$lib/limits');
const { noticeFor } = await import('./billing-emails');

// ── A D1 binding over node:sqlite with every migration applied ─────────────────
const open: DatabaseSync[] = [];
afterEach(() => { for (const d of open.splice(0)) d.close(); });

function database() {
	const sqlite = migratedDatabase();
	open.push(sqlite);
	sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('u1', 'owner@example.com', 'x', 'Olga', 'Owner')`);
	sqlite.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel')`);
	sqlite.exec(`INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m1', 'org', 'u1', 'owner')`);
	return sqlite;
}

function sub(over: Partial<Record<string, unknown>> = {}, amount: number | null = 2999): Stripe.Subscription {
	return {
		id: 'sub_1',
		status: 'active',
		customer: 'cus_1',
		metadata: { orgId: 'org', plan: 'starter' },
		items: { data: amount == null ? [] : [{ price: { unit_amount: amount }, current_period_end: 1_800_000_000 }] },
		...over
	} as unknown as Stripe.Subscription;
}

const row = (s: DatabaseSync) => s.prepare('SELECT plan, status, stripe_subscription_id, stripe_plan, stripe_status, stripe_event_at FROM subscriptions WHERE org_id = ?').get('org') as Record<string, unknown> | undefined;

function addHalls(s: DatabaseSync, n: number, publicFlags: number[] = []) {
	for (let i = 0; i < n; i++) {
		s.prepare(`INSERT INTO halls (id, org_id, name, is_public, created_at) VALUES (?, 'org', ?, ?, ?)`)
			.run(`h${i + 1}`, `Hall ${i + 1}`, publicFlags[i] ?? 1, `2026-01-0${i + 1} 10:00:00`);
	}
}
const halls = (s: DatabaseSync) => s.prepare('SELECT id, is_public, plan_locked, public_before_lock FROM halls ORDER BY id').all() as Array<Record<string, number | string | null>>;

// ── Status mapping (B23) ─────────────────────────────────────────────────────
describe('subscription status', () => {
	it.each([
		['unpaid', 'paused', 'free'],
		['incomplete', 'paused', 'free'],
		['incomplete_expired', 'cancelled', 'free'],
		['paused', 'paused', 'free'],
		['past_due', 'past_due', 'starter'],
		['active', 'active', 'starter'],
		['trialing', 'trialing', 'starter'],
		['something_new', 'paused', 'free'],
	])('Stripe %s is stored as %s and grants %s', async (stripeStatus, status, plan) => {
		const s = database();
		await applySubscription(d1(s), sub({ status: stripeStatus }), 100);
		expect(row(s)).toMatchObject({ status, plan, stripe_status: stripeStatus });
	});

	it('keeps the subscription plan on record while it does not grant it', async () => {
		const s = database();
		await applySubscription(d1(s), sub({ status: 'unpaid' }), 100);
		expect(row(s)).toMatchObject({ plan: 'free', stripe_plan: 'starter' });
	});
});

// ── Ordering (B22) ────────────────────────────────────────────────────────────
describe('out-of-order events', () => {
	it('ignores an older update arriving after the deletion', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({ status: 'canceled' }), 200);
		const res = await applySubscription(db, sub({ status: 'active' }), 150);
		expect(res).toMatchObject({ applied: false, reason: 'stale' });
		expect(row(s)).toMatchObject({ plan: 'free', status: 'cancelled' });
	});

	it('never reactivates an ended subscription, even with an equal timestamp', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({ status: 'canceled' }), 200);
		const res = await applySubscription(db, sub({ status: 'active' }), 200);
		expect(res.reason).toBe('ended');
		expect(row(s)).toMatchObject({ plan: 'free' });
	});

	it('does not let the end of an old subscription downgrade a newer paid one', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({ id: 'sub_new' }, 7999), 300);
		const res = await applySubscription(db, sub({ id: 'sub_old', status: 'canceled' }), 400);
		expect(res.reason).toBe('other_subscription');
		expect(row(s)).toMatchObject({ plan: 'professional', stripe_subscription_id: 'sub_new' });
	});

	it('accepts a new subscription after the old one ended', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({ id: 'sub_old', status: 'canceled' }), 300);
		await applySubscription(db, sub({ id: 'sub_new' }), 400);
		expect(row(s)).toMatchObject({ plan: 'starter', status: 'active', stripe_subscription_id: 'sub_new' });
	});

	it('pure rule: no row means apply', () => {
		expect(skipReason(null, { subscriptionId: 'x', stripeStatus: 'active', at: 1 })).toBeNull();
	});
});

// ── Unknown org / payload (B90) and unknown price (B161) ─────────────────────
describe('payloads we cannot use', () => {
	it('acknowledges a subscription for a deleted organisation without throwing', async () => {
		const s = database();
		const res = await applySubscription(d1(s), sub({ metadata: { orgId: 'gone', plan: 'starter' } }), 100);
		expect(res).toMatchObject({ applied: false, reason: 'unknown_org' });
	});

	it('handles a subscription with no items', async () => {
		const s = database();
		const res = await applySubscription(d1(s), sub({}, null), 100);
		expect(res.applied).toBe(true); // metadata names the plan
		expect(row(s)).toMatchObject({ plan: 'starter' });
	});

	it('leaves the plan alone for an unknown price without usable metadata', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({}, 7999), 100);
		const res = await applySubscription(db, sub({ id: 'sub_2', metadata: { orgId: 'org' } }, 4999), 200);
		expect(res.reason).toBe('unknown_plan');
		const res2 = await applySubscription(db, sub({ id: 'sub_3', metadata: { orgId: 'org', plan: 'gold' } }, 4999), 300);
		expect(res2.reason).toBe('unknown_plan');
		expect(row(s)).toMatchObject({ plan: 'professional' });
	});

	it('keeps the known plan for the same subscription when the price is unknown', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub({}, 7999), 100);
		await applySubscription(db, sub({ metadata: { orgId: 'org' } }, 4999), 200);
		expect(row(s)).toMatchObject({ plan: 'professional' });
	});
});

// ── Hall limits (B20) ─────────────────────────────────────────────────────────
describe('plan hall limits', () => {
	it('locks only the halls over the limit, keeping public ones first', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 3, [0, 1, 1]);
		const change = await enforcePlanLimits(db, 'org', 'free');
		expect(change.locked.map((h) => h.id).sort()).toEqual(['h1', 'h3']);
		expect(halls(s)).toEqual([
			{ id: 'h1', is_public: 0, plan_locked: 1, public_before_lock: 0 },
			{ id: 'h2', is_public: 1, plan_locked: 0, public_before_lock: null },
			{ id: 'h3', is_public: 0, plan_locked: 1, public_before_lock: 1 },
		]);
	});

	it('brings suspended halls back, public again, when the plan has room', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 3);
		await enforcePlanLimits(db, 'org', 'free');
		const change = await enforcePlanLimits(db, 'org', 'starter');
		expect(change.unlocked).toHaveLength(2);
		expect(halls(s).every((h) => h.plan_locked === 0 && h.is_public === 1)).toBe(true);
	});

	it('reactivating one hall restores its visibility', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 2);
		await enforcePlanLimits(db, 'org', 'free');
		await unlockHall(db, 'org', 'h2');
		expect(halls(s)[1]).toMatchObject({ plan_locked: 0, is_public: 1, public_before_lock: null });
	});

	// B20/B84 round-1: the swap left the reactivated hall a draft and the paused one
	// with no public_before_lock, so neither came back public after renewing.
	it('swapping halls keeps both halls\' visibility', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 2);
		await enforcePlanLimits(db, 'org', 'free'); // h2 locked, was public
		expect(await swapActiveHall(db, 'org', 'free', 'h2', 'h1')).toBe(true);
		expect(halls(s)).toEqual([
			{ id: 'h1', is_public: 0, plan_locked: 1, public_before_lock: 1 },
			{ id: 'h2', is_public: 1, plan_locked: 0, public_before_lock: null },
		]);
		await enforcePlanLimits(db, 'org', 'starter');
		expect(halls(s).every((h) => h.plan_locked === 0 && h.is_public === 1)).toBe(true);
	});

	it('an undone swap restores the paused hall\'s visibility', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 2);
		await enforcePlanLimits(db, 'org', 'free');
		// Another active hall appeared meanwhile, so pausing h1 frees no room.
		s.prepare("INSERT INTO halls (id, org_id, name, is_public, created_at) VALUES ('h3', 'org', 'Hall 3', 1, '2026-01-03 10:00:00')").run();
		expect(await swapActiveHall(db, 'org', 'free', 'h2', 'h1')).toBe(false);
		expect(halls(s)[0]).toEqual({ id: 'h1', is_public: 1, plan_locked: 0, public_before_lock: null });
		expect(halls(s)[1]).toMatchObject({ plan_locked: 1 });
	});

	it('a subscription ending suspends the extra halls; renewing restores them', async () => {
		const s = database(); const db = d1(s);
		addHalls(s, 3);
		await applySubscription(db, sub({}, 7999), 100);
		await applySubscription(db, sub({ status: 'canceled' }), 200);
		expect(halls(s).filter((h) => h.plan_locked === 0)).toHaveLength(1);
		await applySubscription(db, sub({ id: 'sub_2' }, 7999), 300);
		expect(halls(s).filter((h) => h.plan_locked === 0)).toHaveLength(3);
	});
});

// ── Owner notices (I10) ───────────────────────────────────────────────────────
describe('billing notices', () => {
	const emails = (s: DatabaseSync) => s.prepare('SELECT recipient, subject, template FROM email_log ORDER BY rowid').all() as Array<Record<string, string>>;

	it('emails the owner when a payment fails, once', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub(), 100);
		await applySubscription(db, sub({ status: 'past_due' }), 200);
		await applySubscription(db, sub({ status: 'past_due' }), 300);
		expect(emails(s)).toEqual([{ recipient: 'owner@example.com', subject: 'Platba za Hallify sa nepodarila', template: 'billing-payment_failed' }]);
	});

	it('emails the owner when the subscription ends', async () => {
		const s = database(); const db = d1(s);
		await applySubscription(db, sub(), 100);
		await applySubscription(db, sub({ status: 'canceled' }), 200);
		expect(emails(s).map((e) => e.template)).toEqual(['billing-ended']);
	});

	it('does not email for a brand-new subscription', () => {
		expect(noticeFor(null, { plan: 'starter', status: 'active', stripePlan: 'starter' })).toBeNull();
		expect(noticeFor({ plan: 'free', status: 'active', stripe_plan: null }, { plan: 'free', status: 'paused', stripePlan: 'starter' })).toBeNull();
	});

	it('suspension after a failed payment is announced', () => {
		expect(noticeFor({ plan: 'starter', status: 'past_due', stripe_plan: 'starter' }, { plan: 'free', status: 'paused', stripePlan: 'starter' })).toBe('suspended');
	});
});

// ── Credit packs (B92) ────────────────────────────────────────────────────────
describe('AI credit packs', () => {
	const session = (over: Record<string, unknown> = {}) => ({
		id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 500,
		metadata: { orgId: 'org', kind: 'ai_credits', credits: '50', userId: 'u1' }, ...over
	}) as unknown as Stripe.Checkout.Session;
	const balance = (s: DatabaseSync) => (s.prepare('SELECT balance_mc FROM ai_accounts WHERE org_id = ?').get('org') as { balance_mc: number } | undefined)?.balance_mc ?? 0;
	const event = (type: string, object: unknown, created = 100) => ({ id: 'evt', type, created, data: { object } }) as unknown as Stripe.Event;
	const deps = { retrieveSubscription: async () => null };

	it('credits a delayed payment when it succeeds, and only once', async () => {
		const s = database(); const db = d1(s);
		await handleStripeEvent(db, event('checkout.session.completed', session({ payment_status: 'unpaid' })), deps);
		expect(balance(s)).toBe(0);
		await handleStripeEvent(db, event('checkout.session.async_payment_succeeded', session()), deps);
		await handleStripeEvent(db, event('checkout.session.async_payment_succeeded', session()), deps);
		expect(balance(s)).toBe(50_000);
	});

	it('ignores a pack for a deleted organisation', async () => {
		const s = database();
		expect(await applyCreditPurchase(d1(s), session({ metadata: { orgId: 'gone', kind: 'ai_credits' } }))).toBe('ignored');
	});

	it('applies the subscription of a completed subscription checkout', async () => {
		const s = database(); const db = d1(s);
		const fetched = sub({}, 7999);
		await handleStripeEvent(db, event('checkout.session.completed', { id: 'cs_2', mode: 'subscription', subscription: 'sub_1' }),
			{ retrieveSubscription: async () => fetched, now: () => 500 });
		expect(row(s)).toMatchObject({ plan: 'professional', stripe_event_at: 500 });
	});
});
