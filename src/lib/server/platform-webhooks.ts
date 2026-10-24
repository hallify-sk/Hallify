// Platform webhooks: Hallify's own operator feed (sign-ups, new and closed
// organisations, plan changes, payments, service requests, ...), for platform admins.
// The organisation webhooks live in $lib/notifications; these are kept apart on
// purpose (own tables, own page at /app/platform/webhooks).
//
// Delivery
//   - Every event becomes one delivery per subscribed endpoint. The delivery's id is
//     the payload's `id` and never changes, so a receiver deduplicates on it.
//   - The body is signed like the organisation webhooks:
//       X-Hallify-Signature: sha256=<hex HMAC-SHA256(secret, raw body)>
//     plus X-Hallify-Event and X-Hallify-Delivery. The body carries `created_at`, which
//     is signed with it, so a receiver can refuse old replays.
//   - The first attempt is made straight away, kept alive past the response with
//     keepAlive (waitUntil). Each attempt is recorded (status code, duration, error,
//     the first 1 000 characters of the answer).
//   - A failed delivery is retried by the hourly cron (/api/cron/cleanup) with
//     exponential backoff, RETRY_DELAYS_MIN after attempts 1..5, so at most
//     MAX_ATTEMPTS sends over about 31 hours; then it is marked failed and can still be
//     sent again by hand.
//   - An endpoint that fails AUTO_DISABLE_AFTER attempts in a row (any success resets
//     the count) is switched off, with disabled_reason = 'failures' shown on the page.
//
// Dispatch never throws and never delays the caller: call sites fire and forget.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { keepAlive } from '$lib/server/background';
import { isSafeWebhookUrl } from '$lib/safe-url';
import {
	PLATFORM_EVENT_FIELDS,
	type PlatformEvent,
	type PlatformEventData,
	type PlatformPayloadEvent,
	type PlatformWebhookPayload,
} from '$lib/platform-webhook-events';

type Db = App.Locals['db'];

export const MAX_ATTEMPTS = 6;
/** Wait before attempt n+1, after attempt n failed (n = 1..5), in minutes. */
export const RETRY_DELAYS_MIN = [60, 120, 240, 480, 960] as const;
/** Failed attempts in a row after which an endpoint is switched off. */
export const AUTO_DISABLE_AFTER = 15;
export const REQUEST_TIMEOUT_MS = 10_000;
export const RESPONSE_EXCERPT_CHARS = 1000;
/** Deliveries older than this are pruned by the cron run. */
export const KEEP_DELIVERIES_DAYS = 30;

export type AttemptTrigger = 'dispatch' | 'retry' | 'manual' | 'test';

/** fetch and the clock, injectable for tests. */
export interface DeliveryDeps {
	fetch?: typeof fetch;
	now?: () => Date;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Hex HMAC-SHA256 of `body` with `secret` (Web Crypto: works on Workers and Node). */
export async function signPlatformPayload(secret: string, body: string): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
	return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The headers of one send. */
export async function platformWebhookHeaders(secret: string, body: string, payload: Pick<PlatformWebhookPayload, 'id' | 'event'>): Promise<Record<string, string>> {
	return {
		'Content-Type': 'application/json',
		'User-Agent': 'Hallify-Webhooks/1.0',
		'X-Hallify-Event': payload.event,
		'X-Hallify-Delivery': payload.id,
		'X-Hallify-Signature': `sha256=${await signPlatformPayload(secret, body)}`,
	};
}

/** Whether an endpoint with this stored `events` value receives `event`.
 *  NULL means every event; an unreadable value means none. The test event goes to all. */
export function subscribes(events: string | null, event: PlatformPayloadEvent): boolean {
	if (event === 'platform.test' || events === null) return true;
	try {
		const list: unknown = JSON.parse(events);
		return Array.isArray(list) && list.includes(event);
	} catch {
		return false;
	}
}

/** The payload for an event: only the documented fields of `data` (missing ones as
 *  null, anything else dropped), so the shape is stable and nothing extra leaks. */
export function buildPlatformPayload<E extends PlatformPayloadEvent>(
	event: E,
	data: PlatformEventData<E>,
	opts: { id?: string; now?: Date } = {}
): PlatformWebhookPayload {
	const out: PlatformWebhookPayload['data'] = {};
	const given = data as Record<string, unknown>;
	for (const field of PLATFORM_EVENT_FIELDS[event] as readonly string[]) {
		const v = given[field];
		out[field] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
	}
	return { id: opts.id ?? crypto.randomUUID(), event, created_at: (opts.now ?? new Date()).toISOString(), data: out };
}

/** When attempt `attempts + 1` is due after attempt `attempts` failed, or null when
 *  the delivery has used all MAX_ATTEMPTS. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
	if (attempts >= MAX_ATTEMPTS || attempts < 1) return null;
	const minutes = RETRY_DELAYS_MIN[Math.min(attempts, RETRY_DELAYS_MIN.length) - 1];
	return new Date(now.getTime() + minutes * 60_000);
}

/** Whether a failure count switches an endpoint off. */
export function shouldAutoDisable(consecutiveFailures: number): boolean {
	return consecutiveFailures >= AUTO_DISABLE_AFTER;
}

/** A new signing secret: 32 random bytes, hex, with a recognisable prefix. */
export function generateWebhookSecret(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return 'whsec_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Sending ─────────────────────────────────────────────────────────────────

interface DeliveryRow {
	id: string;
	webhook_id: string;
	event: string;
	payload: string;
	status: 'pending' | 'delivered' | 'failed';
	attempts: number;
	next_attempt_at: string | null;
}

interface EndpointRow {
	id: string;
	url: string;
	secret: string;
	enabled: number;
	consecutive_failures: number;
}

export interface AttemptResult {
	ok: boolean;
	statusCode: number | null;
	durationMs: number;
	error: string | null;
	/** The delivery's status after this attempt. */
	status: DeliveryRow['status'];
	nextAttemptAt: string | null;
	/** True when this attempt switched the endpoint off. */
	disabledNow: boolean;
}

/** POST the stored payload once and record everything about it. Never throws. */
async function attempt(db: Db, delivery: DeliveryRow, endpoint: EndpointRow, trigger: AttemptTrigger, deps: DeliveryDeps): Promise<AttemptResult> {
	const doFetch = deps.fetch ?? fetch;
	const now = () => (deps.now ? deps.now() : new Date());
	const started = Date.now();
	let statusCode: number | null = null;
	let error: string | null = null;
	let responseBody: string | null = null;

	// Checked at send time too: redirects are not followed, internal addresses never called.
	if (!isSafeWebhookUrl(endpoint.url)) {
		error = 'Blocked: the endpoint must be a public https:// address';
	} else {
		try {
			const headers = await platformWebhookHeaders(endpoint.secret, delivery.payload, { id: delivery.id, event: delivery.event as PlatformPayloadEvent });
			const res = await doFetch(endpoint.url, {
				method: 'POST',
				headers,
				body: delivery.payload,
				redirect: 'manual',
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			statusCode = res.status;
			responseBody = (await res.text().catch(() => '')).slice(0, RESPONSE_EXCERPT_CHARS) || null;
			if (!res.ok) error = `HTTP ${res.status}`;
		} catch (e) {
			const name = e instanceof Error ? e.name : '';
			error = name === 'TimeoutError' || name === 'AbortError'
				? `Timed out after ${REQUEST_TIMEOUT_MS / 1000} s`
				: (e instanceof Error ? e.message : String(e)).slice(0, 500) || 'Delivery failed';
		}
	}
	const ok = statusCode !== null && statusCode >= 200 && statusCode < 300;
	const durationMs = Date.now() - started;
	const at = now();
	const attempts = delivery.attempts + 1;

	let status: DeliveryRow['status'];
	let next: string | null = null;
	if (ok) status = 'delivered';
	else if (trigger === 'test') status = 'failed'; // a test is a one-off: no retries
	else if (trigger === 'manual') {
		// Sending again by hand does not restart the schedule: a pending delivery keeps
		// its next retry, one that had given up stays given up.
		status = delivery.status === 'pending' ? 'pending' : 'failed';
		next = status === 'pending' ? delivery.next_attempt_at : null;
	} else {
		const due = nextAttemptAt(attempts, at);
		status = due ? 'pending' : 'failed';
		next = due?.toISOString() ?? null;
	}

	await dbRun(db,
		`INSERT INTO platform_webhook_attempts (id, delivery_id, attempt, trigger, status_code, duration_ms, error, response_body, attempted_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		crypto.randomUUID(), delivery.id, attempts, trigger, statusCode, durationMs, error, responseBody, at.toISOString()).catch(() => {});
	await dbRun(db,
		`UPDATE platform_webhook_deliveries
		    SET status = ?, attempts = ?, next_attempt_at = ?, last_attempt_at = ?, response_code = ?, error = ?
		  WHERE id = ?`,
		status, attempts, next, at.toISOString(), statusCode, error, delivery.id).catch(() => {});

	// The endpoint's health. A test's failure does not count towards switching it off.
	let disabledNow = false;
	if (ok) {
		await dbRun(db, 'UPDATE platform_webhooks SET consecutive_failures = 0, last_success_at = ? WHERE id = ?', at.toISOString(), endpoint.id).catch(() => {});
	} else if (trigger !== 'test') {
		const failures = endpoint.consecutive_failures + 1;
		disabledNow = !!endpoint.enabled && shouldAutoDisable(failures);
		await dbRun(db,
			`UPDATE platform_webhooks
			    SET consecutive_failures = consecutive_failures + 1, last_failure_at = ?,
			        enabled = CASE WHEN ? THEN 0 ELSE enabled END,
			        disabled_reason = CASE WHEN ? THEN 'failures' ELSE disabled_reason END,
			        disabled_at = CASE WHEN ? THEN ? ELSE disabled_at END
			  WHERE id = ?`,
			at.toISOString(), disabledNow ? 1 : 0, disabledNow ? 1 : 0, disabledNow ? 1 : 0, at.toISOString(), endpoint.id).catch(() => {});
		if (disabledNow) console.warn(`[platform-webhooks] endpoint ${endpoint.id} switched off after ${failures} failed attempts in a row`);
	}
	return { ok, statusCode, durationMs, error, status, nextAttemptAt: next, disabledNow };
}

/** Store a delivery for one endpoint and make its first attempt. */
async function deliverTo(db: Db, endpoint: EndpointRow, payload: PlatformWebhookPayload, trigger: 'dispatch' | 'test', deps: DeliveryDeps): Promise<AttemptResult> {
	const body = JSON.stringify(payload);
	const now = deps.now ? deps.now() : new Date();
	// Due in an hour as a safety net: should the Worker be stopped before the first
	// attempt finishes, the cron picks the delivery up instead of losing it.
	const safetyNet = trigger === 'test' ? null : new Date(now.getTime() + RETRY_DELAYS_MIN[0] * 60_000).toISOString();
	await dbRun(db,
		`INSERT INTO platform_webhook_deliveries (id, webhook_id, event, payload, status, attempts, next_attempt_at)
		 VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
		payload.id, endpoint.id, payload.event, body, safetyNet);
	return attempt(db, { id: payload.id, webhook_id: endpoint.id, event: payload.event, payload: body, status: 'pending', attempts: 0, next_attempt_at: safetyNet }, endpoint, trigger, deps);
}

/**
 * Send a platform event to every enabled endpoint that subscribes to it. Fire and
 * forget: never throws, kept alive past the response. Returns the work so tests (and
 * a caller that wants to) can await it.
 */
export function dispatchPlatformEvent<E extends PlatformEvent>(db: Db, event: E, data: PlatformEventData<E>, deps: DeliveryDeps = {}): Promise<void> {
	const work = (async () => {
		let endpoints: (EndpointRow & { events: string | null })[];
		try {
			endpoints = await dbAll<EndpointRow & { events: string | null }>(db,
				'SELECT id, url, secret, events, enabled, consecutive_failures FROM platform_webhooks WHERE enabled = 1');
		} catch {
			return; // table not migrated yet
		}
		const targets = endpoints.filter((e) => subscribes(e.events, event));
		if (!targets.length) return;
		const now = deps.now ? deps.now() : new Date();
		await Promise.all(targets.map(async (endpoint) => {
			// One id per endpoint: each receiver deduplicates its own deliveries.
			const payload = buildPlatformPayload(event, data, { now });
			await deliverTo(db, endpoint, payload, 'dispatch', deps).catch((e) => console.error('[platform-webhooks] delivery failed', event, e));
		}));
	})().catch((e) => console.error('[platform-webhooks] dispatch failed', event, e));
	return keepAlive(work);
}

/** The "Send test" button: a `platform.test` event to one endpoint, awaited. */
export async function sendPlatformTest(db: Db, webhookId: string, sentBy: string | null, deps: DeliveryDeps = {}): Promise<AttemptResult | null> {
	const endpoint = await dbFirst<EndpointRow>(db, 'SELECT id, url, secret, enabled, consecutive_failures FROM platform_webhooks WHERE id = ?', webhookId);
	if (!endpoint) return null;
	const payload = buildPlatformPayload('platform.test', { message: 'Test event from Hallify platform webhooks', sent_by: sentBy }, { now: deps.now?.() });
	return deliverTo(db, endpoint, payload, 'test', deps);
}

/** "Send again" on one delivery: the same body, same id. Works on a switched-off endpoint too. */
export async function redeliverPlatformDelivery(db: Db, deliveryId: string, deps: DeliveryDeps = {}): Promise<AttemptResult | null> {
	const row = await dbFirst<DeliveryRow & { url: string; secret: string; enabled: number; consecutive_failures: number }>(db,
		`SELECT d.id, d.webhook_id, d.event, d.payload, d.status, d.attempts, d.next_attempt_at,
		        w.url, w.secret, w.enabled, w.consecutive_failures
		   FROM platform_webhook_deliveries d JOIN platform_webhooks w ON w.id = d.webhook_id
		  WHERE d.id = ?`, deliveryId);
	if (!row) return null;
	return attempt(db, row, { id: row.webhook_id, url: row.url, secret: row.secret, enabled: row.enabled, consecutive_failures: row.consecutive_failures }, 'manual', deps);
}

export interface RetryRun {
	retried: number;
	delivered: number;
	failed: number;
	pruned: number;
}

/** The cron's pass: retry what is due on enabled endpoints (oldest first, at most
 *  `limit`, one by one to stay well inside the Worker's subrequest budget) and prune
 *  deliveries older than KEEP_DELIVERIES_DAYS. */
export async function retryDuePlatformDeliveries(db: Db, opts: DeliveryDeps & { limit?: number } = {}): Promise<RetryRun> {
	const out: RetryRun = { retried: 0, delivered: 0, failed: 0, pruned: 0 };
	const now = opts.now ? opts.now() : new Date();
	let due: (DeliveryRow & { url: string; secret: string; enabled: number; consecutive_failures: number })[];
	try {
		due = await dbAll(db,
			`SELECT d.id, d.webhook_id, d.event, d.payload, d.status, d.attempts, d.next_attempt_at,
			        w.url, w.secret, w.enabled, w.consecutive_failures
			   FROM platform_webhook_deliveries d JOIN platform_webhooks w ON w.id = d.webhook_id
			  WHERE d.status = 'pending' AND w.enabled = 1 AND d.next_attempt_at IS NOT NULL AND d.next_attempt_at <= ?
			  ORDER BY d.next_attempt_at LIMIT ?`,
			now.toISOString(), opts.limit ?? 25);
	} catch {
		return out; // table not migrated yet
	}
	for (const row of due) {
		// Re-read the endpoint's failure count: an earlier retry in this run may have moved it.
		const endpoint = await dbFirst<EndpointRow>(db, 'SELECT id, url, secret, enabled, consecutive_failures FROM platform_webhooks WHERE id = ?', row.webhook_id);
		if (!endpoint?.enabled) continue;
		const r = await attempt(db, row, endpoint, 'retry', opts);
		out.retried++;
		if (r.ok) out.delivered++;
		else if (r.status === 'failed') out.failed++;
	}
	const cutoff = new Date(now.getTime() - KEEP_DELIVERIES_DAYS * 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
	const pruned = await dbRun(db, `DELETE FROM platform_webhook_deliveries WHERE created_at < ? AND status != 'pending'`, cutoff).catch(() => null);
	out.pruned = pruned?.meta?.changes ?? 0;
	return out;
}

// ── Plan changes ────────────────────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, professional: 2, enterprise: 3 };

export type PlanChange = 'start' | 'upgrade' | 'downgrade' | 'cancel' | 'suspend' | 'payment_issue' | 'resume' | 'status_change';

/** What kind of change moved an organisation from `before` to `after`, or null when
 *  neither the plan nor the status moved (a renewal, a replayed event). */
export function classifyPlanChange(
	before: { plan: string; status: string } | null,
	after: { plan: string; status: string }
): PlanChange | null {
	if (!before) return after.plan === 'free' ? null : 'start';
	if (before.plan === after.plan && before.status === after.status) return null;
	if (after.status === 'cancelled' && before.status !== 'cancelled') return 'cancel';
	if (after.status === 'paused' && before.status !== 'paused') return 'suspend';
	if (after.status === 'past_due' && before.status !== 'past_due') return 'payment_issue';
	const up = (PLAN_RANK[after.plan] ?? 0) - (PLAN_RANK[before.plan] ?? 0);
	if (up > 0) return before.status === 'cancelled' ? 'start' : 'upgrade';
	if (up < 0) return 'downgrade';
	if (['paused', 'past_due', 'cancelled'].includes(before.status)) return 'resume';
	return 'status_change';
}
