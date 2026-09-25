import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

const SECRET = 'whsec_test_webhook';

vi.mock('$env/dynamic/private', () => ({
	env: { STRIPE_SECRET_KEY: 'sk_test_mock_key', STRIPE_WEBHOOK_SECRET: SECRET },
}));

// Run against Stripe's WORKER build — the one the Cloudflare bundle ships, since the
// adapter resolves the `workerd` export condition. Its Web Crypto provider can only
// verify signatures asynchronously, so this suite fails if the handler goes back to
// the sync `constructEvent`: that rejected every real event in production. (Node
// would otherwise resolve the node build, where the sync call happens to work.)
vi.mock('stripe', async () => await import('../../../../../node_modules/stripe/esm/stripe.esm.worker.js'));

const enforcePlanLimits = vi.fn();
vi.mock('$lib/limits', () => ({ enforcePlanLimits }));

const { POST } = await import('./+server');

/** Minimal D1 stand-in that records every write. */
function fakeDb() {
	const runs: { sql: string; params: unknown[] }[] = [];
	const db = {
		prepare: (sql: string) => ({
			bind: (...params: unknown[]) => ({
				run: async () => {
					runs.push({ sql, params });
					return { success: true };
				},
			}),
		}),
	};
	return { db, runs };
}

/** Sign a payload exactly the way Stripe does. */
function sign(payload: string, secret = SECRET): string {
	const t = Math.floor(Date.now() / 1000);
	const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
	return `t=${t},v1=${v1}`;
}

function subscriptionEvent(sub: Record<string, unknown>, type = 'customer.subscription.updated') {
	return JSON.stringify({
		id: 'evt_1',
		object: 'event',
		type,
		data: {
			object: {
				id: 'sub_1',
				object: 'subscription',
				customer: 'cus_1',
				status: 'active',
				metadata: { orgId: 'org_1', plan: 'starter' },
				items: { data: [{ id: 'si_1', price: { unit_amount: 2999 }, current_period_end: 1_900_000_000 }] },
				...sub,
			},
		},
	});
}

async function deliver(payload: string, signature = sign(payload)) {
	const { db, runs } = fakeDb();
	const request = new Request('https://hallify.sk/api/stripe/webhook', {
		method: 'POST',
		headers: { 'stripe-signature': signature },
		body: payload,
	});
	const res = await POST({ request, locals: { db } } as never);
	// The upsert binds (id, org_id, plan, status, customer, subscription, period_end).
	const upsert = runs.find((r) => r.sql.includes('INSERT INTO subscriptions'));
	return {
		status: res.status,
		upsert: upsert && {
			orgId: upsert.params[1],
			plan: upsert.params[2],
			status: upsert.params[3],
			periodEnd: upsert.params[6],
		},
	};
}

beforeEach(() => enforcePlanLimits.mockReset());

describe('Stripe webhook signature', () => {
	it('accepts a correctly signed event and upgrades the org', async () => {
		const res = await deliver(subscriptionEvent({}, 'customer.subscription.created'));
		expect(res.status).toBe(200);
		expect(res.upsert).toMatchObject({ orgId: 'org_1', plan: 'starter', status: 'active' });
		expect(enforcePlanLimits).toHaveBeenCalledWith(expect.anything(), 'org_1', 'starter');
	});

	it('rejects an event signed with another secret', async () => {
		const payload = subscriptionEvent({});
		const res = await deliver(payload, sign(payload, 'whsec_someone_else'));
		expect(res.status).toBe(400);
		expect(res.upsert).toBeUndefined();
	});
});

describe('Stripe webhook subscription sync', () => {
	it.each([
		// [stripe status, plan, stored status]
		['active', 'starter', 'active'],
		['trialing', 'starter', 'trialing'],
		['past_due', 'starter', 'past_due'],       // Stripe still retrying: keep access
		['incomplete', 'starter', 'active'],       // can arrive after `active` — must not revoke
		['unpaid', 'free', 'past_due'],            // retries exhausted
		['incomplete_expired', 'free', 'cancelled'], // first payment never succeeded
		['canceled', 'free', 'cancelled'],
		['paused', 'free', 'paused'],
	])('%s → plan %s, status %s', async (stripeStatus, plan, status) => {
		const res = await deliver(subscriptionEvent({ status: stripeStatus }));
		expect(res.status).toBe(200);
		expect(res.upsert).toMatchObject({ plan, status });
	});

	it('reads the renewal date from the subscription item (basil payloads)', async () => {
		const res = await deliver(subscriptionEvent({}));
		expect(res.upsert?.periodEnd).toBe(new Date(1_900_000_000 * 1000).toISOString());
	});

	it('still reads the top-level renewal date of pre-basil payloads', async () => {
		const res = await deliver(subscriptionEvent({
			current_period_end: 1_800_000_000,
			items: { data: [{ id: 'si_1', price: { unit_amount: 2999 } }] },
		}));
		expect(res.upsert?.periodEnd).toBe(new Date(1_800_000_000 * 1000).toISOString());
	});
});
