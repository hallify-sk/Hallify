import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { d1, migratedDatabase } from './sqlite-d1.testutil';
import {
	AUTO_DISABLE_AFTER,
	MAX_ATTEMPTS,
	RETRY_DELAYS_MIN,
	buildPlatformPayload,
	classifyPlanChange,
	dispatchPlatformEvent,
	generateWebhookSecret,
	nextAttemptAt,
	platformWebhookHeaders,
	redeliverPlatformDelivery,
	retryDuePlatformDeliveries,
	sendPlatformTest,
	shouldAutoDisable,
	signPlatformPayload,
	subscribes,
} from './platform-webhooks';
import { PLATFORM_EVENTS, PLATFORM_EVENT_FIELDS, PLATFORM_EVENT_GROUPS } from '$lib/platform-webhook-events';
import { sk, en } from '$lib/i18n';

const T0 = new Date('2026-10-24T10:00:00.000Z');

function setup() {
	const sqlite = migratedDatabase();
	const db = d1(sqlite);
	const add = (id: string, opts: { url?: string; events?: string[] | null; enabled?: number; failures?: number } = {}) =>
		sqlite.prepare('INSERT INTO platform_webhooks (id, url, secret, events, enabled, consecutive_failures) VALUES (?, ?, ?, ?, ?, ?)')
			.run(id, opts.url ?? `https://hooks.example.com/${id}`, `secret-${id}`, opts.events === undefined ? null : opts.events === null ? null : JSON.stringify(opts.events), opts.enabled ?? 1, opts.failures ?? 0);
	const rows = <T>(sql: string, ...p: unknown[]) => sqlite.prepare(sql).all(...(p as never[])) as T[];
	return { sqlite, db, add, rows };
}

/** A fetch that answers with `status` and records what it was sent. */
function fakeFetch(status: number | (() => number) | 'throw' = 200) {
	const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
	const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
		if (status === 'throw') throw new Error('connect ECONNREFUSED');
		const code = typeof status === 'function' ? status() : status;
		return new Response(code === 204 ? null : `answer ${code}`, { status: code });
	});
	return { fetch: fn as unknown as typeof fetch, calls };
}

describe('signing', () => {
	it('is the hex HMAC-SHA256 of the raw body, the same as node:crypto and the org webhooks', async () => {
		const body = JSON.stringify({ id: 'x', event: 'org.created', created_at: T0.toISOString(), data: { org_id: 'o1' } });
		const expected = createHmac('sha256', 'whsec_test').update(body).digest('hex');
		expect(await signPlatformPayload('whsec_test', body)).toBe(expected);
		const headers = await platformWebhookHeaders('whsec_test', body, { id: 'x', event: 'org.created' });
		expect(headers['X-Hallify-Signature']).toBe(`sha256=${expected}`);
		expect(headers['X-Hallify-Event']).toBe('org.created');
		expect(headers['X-Hallify-Delivery']).toBe('x');
	});

	it('changes with the secret and with any byte of the body', async () => {
		const a = await signPlatformPayload('s1', '{"a":1}');
		expect(await signPlatformPayload('s2', '{"a":1}')).not.toBe(a);
		expect(await signPlatformPayload('s1', '{"a":2}')).not.toBe(a);
	});

	it('generates long, distinct secrets', () => {
		const a = generateWebhookSecret();
		expect(a).toMatch(/^whsec_[0-9a-f]{64}$/);
		expect(generateWebhookSecret()).not.toBe(a);
	});
});

describe('event filtering', () => {
	it('sends everything to an endpoint with no list (NULL)', () => {
		expect(subscribes(null, 'org.created')).toBe(true);
		expect(subscribes(null, 'reservation.created')).toBe(true);
	});

	it('sends only the chosen events otherwise', () => {
		const events = JSON.stringify(['user.registered', 'payment.failed']);
		expect(subscribes(events, 'user.registered')).toBe(true);
		expect(subscribes(events, 'org.created')).toBe(false);
		expect(subscribes('[]', 'org.created')).toBe(false);
	});

	it('sends nothing for an unreadable list, but a test always goes', () => {
		expect(subscribes('not json', 'org.created')).toBe(false);
		expect(subscribes('{"a":1}', 'org.created')).toBe(false);
		expect(subscribes('[]', 'platform.test')).toBe(true);
	});
});

describe('payload builders', () => {
	it('carries id, event, created_at and the documented fields only', () => {
		const p = buildPlatformPayload('user.registered', {
			user_id: 'u1', email: 'a@b.sk', source: 'register', org_id: null, locale: 'sk',
			// Not documented for the event: must never be sent, whatever a call site passes.
			...({ password_hash: '$2a$12$secret', token: 'abc' } as object),
		}, { id: 'd1', now: T0 });
		expect(p).toEqual({
			id: 'd1', event: 'user.registered', created_at: T0.toISOString(),
			data: { user_id: 'u1', email: 'a@b.sk', source: 'register', org_id: null, locale: 'sk' },
		});
	});

	it('fills missing fields with null and drops values that are not plain', () => {
		const p = buildPlatformPayload('org.closed', { org_id: 'o1', ...({ name: { nested: true } } as object) });
		expect(Object.keys(p.data)).toEqual([...PLATFORM_EVENT_FIELDS['org.closed']]);
		expect(p.data.org_id).toBe('o1');
		expect(p.data.name).toBeNull();
		expect(p.data.member_count).toBeNull();
	});

	it('gives every payload a fresh id', () => {
		expect(buildPlatformPayload('org.created', {}).id).not.toBe(buildPlatformPayload('org.created', {}).id);
	});

	it('keeps personal data out of the activity events', () => {
		for (const ev of ['reservation.created', 'feedback.received'] as const) {
			const fields: readonly string[] = PLATFORM_EVENT_FIELDS[ev];
			for (const f of ['email', 'name', 'first_name', 'last_name', 'phone', 'comment', 'user_id', 'title']) expect(fields).not.toContain(f);
		}
	});

	it('documents and labels every event in both languages', () => {
		expect(new Set(PLATFORM_EVENTS).size).toBe(PLATFORM_EVENTS.length);
		expect(PLATFORM_EVENTS.length).toBe(Object.values(PLATFORM_EVENT_GROUPS).flat().length);
		for (const ev of [...PLATFORM_EVENTS, 'platform.test' as const]) {
			expect(PLATFORM_EVENT_FIELDS[ev].length).toBeGreaterThan(0);
			for (const dict of [sk, en]) {
				expect(dict.platformWebhooks.events[ev]).toBeTruthy();
				expect(dict.platformWebhooks.eventDocs[ev]).toBeTruthy();
			}
		}
	});
});

describe('retry backoff', () => {
	it('waits 1, 2, 4, 8 and 16 hours, then gives up after MAX_ATTEMPTS', () => {
		expect(MAX_ATTEMPTS).toBe(RETRY_DELAYS_MIN.length + 1);
		const hours = [1, 2, 3, 4, 5].map((n) => (nextAttemptAt(n, T0)!.getTime() - T0.getTime()) / 3_600_000);
		expect(hours).toEqual([1, 2, 4, 8, 16]);
		expect(nextAttemptAt(MAX_ATTEMPTS, T0)).toBeNull();
		expect(nextAttemptAt(MAX_ATTEMPTS + 3, T0)).toBeNull();
		expect(nextAttemptAt(0, T0)).toBeNull();
	});

	it('switches an endpoint off at AUTO_DISABLE_AFTER failures in a row', () => {
		expect(shouldAutoDisable(AUTO_DISABLE_AFTER - 1)).toBe(false);
		expect(shouldAutoDisable(AUTO_DISABLE_AFTER)).toBe(true);
	});
});

describe('plan changes', () => {
	it('names the change', () => {
		expect(classifyPlanChange(null, { plan: 'starter', status: 'active' })).toBe('start');
		expect(classifyPlanChange(null, { plan: 'free', status: 'active' })).toBeNull();
		expect(classifyPlanChange({ plan: 'free', status: 'active' }, { plan: 'starter', status: 'active' })).toBe('upgrade');
		expect(classifyPlanChange({ plan: 'professional', status: 'active' }, { plan: 'starter', status: 'active' })).toBe('downgrade');
		expect(classifyPlanChange({ plan: 'starter', status: 'active' }, { plan: 'free', status: 'cancelled' })).toBe('cancel');
		expect(classifyPlanChange({ plan: 'starter', status: 'active' }, { plan: 'free', status: 'paused' })).toBe('suspend');
		expect(classifyPlanChange({ plan: 'starter', status: 'active' }, { plan: 'starter', status: 'past_due' })).toBe('payment_issue');
		expect(classifyPlanChange({ plan: 'starter', status: 'past_due' }, { plan: 'starter', status: 'active' })).toBe('resume');
		expect(classifyPlanChange({ plan: 'free', status: 'cancelled' }, { plan: 'starter', status: 'active' })).toBe('start');
		expect(classifyPlanChange({ plan: 'starter', status: 'active' }, { plan: 'starter', status: 'active' })).toBeNull();
	});
});

describe('dispatch and delivery', () => {
	it('sends a signed event to every enabled, subscribed endpoint, and records it', async () => {
		const { db, add, rows } = setup();
		add('all');
		add('orgs', { events: ['org.created'] });
		add('users', { events: ['user.registered'] });
		add('off', { enabled: 0 });
		const { fetch, calls } = fakeFetch(200);

		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o1', name: 'Reduta', slug: 'reduta', plan: 'free', created_by: 'u1' }, { fetch, now: () => T0 });

		expect(calls.map((c) => c.url).sort()).toEqual(['https://hooks.example.com/all', 'https://hooks.example.com/orgs']);
		for (const c of calls) {
			const id = c.url.split('/').pop();
			expect(c.headers['X-Hallify-Signature']).toBe('sha256=' + createHmac('sha256', `secret-${id}`).update(c.body).digest('hex'));
			const body = JSON.parse(c.body);
			expect(body.event).toBe('org.created');
			expect(body.id).toBe(c.headers['X-Hallify-Delivery']);
			expect(body.data).toEqual({ org_id: 'o1', name: 'Reduta', slug: 'reduta', plan: 'free', created_by: 'u1' });
		}
		// One id per endpoint, so each receiver deduplicates on its own.
		expect(new Set(calls.map((c) => c.headers['X-Hallify-Delivery'])).size).toBe(2);

		const deliveries = rows<{ status: string; attempts: number; response_code: number; next_attempt_at: string | null }>('SELECT status, attempts, response_code, next_attempt_at FROM platform_webhook_deliveries');
		expect(deliveries).toHaveLength(2);
		for (const d of deliveries) expect(d).toMatchObject({ status: 'delivered', attempts: 1, response_code: 200, next_attempt_at: null });
		const attempts = rows<{ trigger: string; status_code: number; response_body: string; duration_ms: number }>('SELECT trigger, status_code, response_body, duration_ms FROM platform_webhook_attempts');
		expect(attempts).toHaveLength(2);
		expect(attempts[0]).toMatchObject({ trigger: 'dispatch', status_code: 200, response_body: 'answer 200' });
		expect(attempts[0].duration_ms).toBeGreaterThanOrEqual(0);
	});

	it('does nothing (and never throws) without endpoints or without the table', async () => {
		const { db } = setup();
		const { fetch, calls } = fakeFetch();
		await expect(dispatchPlatformEvent(db, 'org.created', { org_id: 'o1' }, { fetch })).resolves.toBeUndefined();
		expect(calls).toHaveLength(0);
		const broken = { prepare: () => { throw new Error('no such table'); } } as unknown as App.Locals['db'];
		await expect(dispatchPlatformEvent(broken, 'org.created', { org_id: 'o1' }, { fetch })).resolves.toBeUndefined();
	});

	it('never calls an internal address, even one stored before the rule', async () => {
		const { db, add, rows } = setup();
		add('local', { url: 'https://127.0.0.1/hook' });
		const { fetch, calls } = fakeFetch();
		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o1' }, { fetch, now: () => T0 });
		expect(calls).toHaveLength(0);
		expect(rows<{ error: string; status: string }>('SELECT error, status FROM platform_webhook_deliveries')[0]).toMatchObject({ status: 'pending' });
		expect(rows<{ error: string }>('SELECT error FROM platform_webhook_attempts')[0].error).toMatch(/Blocked/);
	});

	it('retries a failed delivery from the cron with backoff, with the same id and body, until it gives up', async () => {
		const { db, add, rows } = setup();
		add('flaky');
		let now = T0;
		const failing = fakeFetch(503);
		await dispatchPlatformEvent(db, 'user.registered', { user_id: 'u1', email: 'a@b.sk', source: 'register' }, { fetch: failing.fetch, now: () => now });
		let d = rows<{ id: string; status: string; attempts: number; next_attempt_at: string; error: string }>('SELECT id, status, attempts, next_attempt_at, error FROM platform_webhook_deliveries')[0];
		expect(d).toMatchObject({ status: 'pending', attempts: 1, error: 'HTTP 503' });
		expect(d.next_attempt_at).toBe(new Date(T0.getTime() + 3_600_000).toISOString());

		// Not due yet: nothing is sent.
		now = new Date(T0.getTime() + 30 * 60_000);
		expect((await retryDuePlatformDeliveries(db, { fetch: failing.fetch, now: () => now })).retried).toBe(0);

		// Each run at the due time makes one more attempt, until MAX_ATTEMPTS.
		for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
			now = new Date(rows<{ next_attempt_at: string }>('SELECT next_attempt_at FROM platform_webhook_deliveries')[0].next_attempt_at);
			const run = await retryDuePlatformDeliveries(db, { fetch: failing.fetch, now: () => now });
			expect(run.retried).toBe(1);
		}
		d = rows<{ id: string; status: string; attempts: number; next_attempt_at: string; error: string }>('SELECT id, status, attempts, next_attempt_at, error FROM platform_webhook_deliveries')[0];
		expect(d).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, next_attempt_at: null });
		expect(failing.calls).toHaveLength(MAX_ATTEMPTS);
		expect(new Set(failing.calls.map((c) => c.body)).size).toBe(1);
		expect(new Set(failing.calls.map((c) => c.headers['X-Hallify-Delivery']))).toEqual(new Set([d.id]));
		expect(rows<{ trigger: string }>('SELECT trigger FROM platform_webhook_attempts ORDER BY attempt').map((a) => a.trigger))
			.toEqual(['dispatch', ...Array(MAX_ATTEMPTS - 1).fill('retry')]);

		// Given up: the cron leaves it; sending it again by hand still works.
		expect((await retryDuePlatformDeliveries(db, { fetch: failing.fetch, now: () => new Date(now.getTime() + 86_400_000) })).retried).toBe(0);
		const ok = fakeFetch(204);
		const manual = await redeliverPlatformDelivery(db, d.id, { fetch: ok.fetch, now: () => now });
		expect(manual).toMatchObject({ ok: true, status: 'delivered', statusCode: 204 });
		expect(rows<{ consecutive_failures: number }>('SELECT consecutive_failures FROM platform_webhooks')[0].consecutive_failures).toBe(0);
	});

	it('a success on retry marks the delivery delivered and resets the failure count', async () => {
		const { db, add, rows } = setup();
		add('w');
		let code = 500;
		const f = fakeFetch(() => code);
		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o1' }, { fetch: f.fetch, now: () => T0 });
		expect(rows<{ consecutive_failures: number }>('SELECT consecutive_failures FROM platform_webhooks')[0].consecutive_failures).toBe(1);
		code = 200;
		const run = await retryDuePlatformDeliveries(db, { fetch: f.fetch, now: () => new Date(T0.getTime() + 2 * 3_600_000) });
		expect(run).toMatchObject({ retried: 1, delivered: 1 });
		expect(rows<{ status: string }>('SELECT status FROM platform_webhook_deliveries')[0].status).toBe('delivered');
		expect(rows<{ consecutive_failures: number; last_success_at: string }>('SELECT consecutive_failures, last_success_at FROM platform_webhooks')[0])
			.toMatchObject({ consecutive_failures: 0 });
	});

	it('switches an endpoint off after AUTO_DISABLE_AFTER failures in a row, and stops sending to it', async () => {
		const { db, add, rows } = setup();
		add('dead', { failures: AUTO_DISABLE_AFTER - 1 });
		const f = fakeFetch('throw');
		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o1' }, { fetch: f.fetch, now: () => T0 });
		const w = rows<{ enabled: number; disabled_reason: string; consecutive_failures: number }>('SELECT enabled, disabled_reason, consecutive_failures FROM platform_webhooks')[0];
		expect(w).toEqual({ enabled: 0, disabled_reason: 'failures', consecutive_failures: AUTO_DISABLE_AFTER });
		expect(rows<{ error: string }>('SELECT error FROM platform_webhook_attempts')[0].error).toMatch(/ECONNREFUSED/);

		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o2' }, { fetch: f.fetch, now: () => T0 });
		expect((await retryDuePlatformDeliveries(db, { fetch: f.fetch, now: () => new Date(T0.getTime() + 86_400_000) })).retried).toBe(0);
		expect(f.calls).toHaveLength(1);
	});

	it('a test goes to any endpoint, is not retried and does not count towards switching off', async () => {
		const { db, add, rows } = setup();
		add('only-orgs', { events: ['org.created'] });
		const f = fakeFetch(500);
		const r = await sendPlatformTest(db, 'only-orgs', 'admin-1', { fetch: f.fetch, now: () => T0 });
		expect(r).toMatchObject({ ok: false, status: 'failed', statusCode: 500 });
		expect(JSON.parse(f.calls[0].body)).toMatchObject({ event: 'platform.test', data: { sent_by: 'admin-1' } });
		expect(rows<{ status: string; next_attempt_at: string | null }>('SELECT status, next_attempt_at FROM platform_webhook_deliveries')[0]).toEqual({ status: 'failed', next_attempt_at: null });
		expect(rows<{ consecutive_failures: number }>('SELECT consecutive_failures FROM platform_webhooks')[0].consecutive_failures).toBe(0);
		expect(await sendPlatformTest(db, 'missing', null, { fetch: f.fetch })).toBeNull();
	});

	it('prunes old finished deliveries, with their attempts', async () => {
		const { db, add, rows, sqlite } = setup();
		add('w');
		await dispatchPlatformEvent(db, 'org.created', { org_id: 'o1' }, { fetch: fakeFetch(200).fetch, now: () => T0 });
		sqlite.prepare(`UPDATE platform_webhook_deliveries SET created_at = '2026-08-01 00:00:00'`).run();
		const run = await retryDuePlatformDeliveries(db, { fetch: fakeFetch().fetch, now: () => T0 });
		expect(run.pruned).toBeGreaterThan(0);
		expect(rows('SELECT id FROM platform_webhook_deliveries')).toHaveLength(0);
		expect(rows('SELECT id FROM platform_webhook_attempts')).toHaveLength(0);
	});
});
