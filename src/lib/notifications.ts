import { createHmac } from 'crypto';
import { dbAll, dbFirst, dbRun, toJson } from '$lib/db/index';
import type { WebhookEvent } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import type { D1Database } from '@cloudflare/workers-types';

export type { WebhookEvent };

export interface WebhookPayload {
  event: WebhookEvent;
  org_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Dispatch webhooks for an org event. Fire-and-forget — never throws.
 * Logs each delivery attempt to webhook_deliveries.
 */
export async function dispatchWebhooks(
  db: D1Database,
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  let webhooks: { id: string; url: string; secret: string | null }[] = [];
  try {
    // Webhooks are a paid feature — a downgraded org stops firing (configs kept).
    const sub = await dbFirst<{ plan: string | null }>(db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId);
    if (!getPlan((sub?.plan ?? 'free') as PlanId).limits.webhooks) return;
    // SQLite stores events as JSON text; filter in app code since ANY() is not supported
    const allWebhooks = await dbAll<{ id: string; url: string; secret: string | null; events: string | null }>(
      db,
      'SELECT id, url, secret, events FROM org_webhooks WHERE org_id = ? AND enabled = 1',
      orgId
    );
    webhooks = allWebhooks.filter((wh) => {
      try {
        const evts: string[] = JSON.parse(wh.events ?? '[]');
        return evts.includes(event);
      } catch {
        return false;
      }
    });
  } catch {
    return;
  }

  if (!webhooks.length) return;

  const payload: WebhookPayload = {
    event,
    org_id: orgId,
    timestamp: new Date().toISOString(),
    data,
  };

  for (const wh of webhooks) {
    // intentionally not awaited — fire and forget
    deliver(db, wh.id, wh.url, wh.secret, payload).catch(() => {});
  }
}

async function deliver(
  db: D1Database,
  webhookId: string,
  url: string,
  secret: string | null,
  payload: WebhookPayload
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Hallify-Webhooks/1.0',
    'X-Hallify-Event': payload.event,
  };

  if (secret) {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-Hallify-Signature'] = `sha256=${sig}`;
  }

  let status: 'delivered' | 'failed' = 'failed';
  let responseCode: number | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    responseCode = res.status;
    status = res.ok ? 'delivered' : 'failed';
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Delivery failed';
  }

  await dbRun(
    db,
    'INSERT INTO webhook_deliveries (id, webhook_id, event, payload, status, response_code, error) VALUES (?, ?, ?, ?, ?, ?, ?)',
    crypto.randomUUID(),
    webhookId,
    payload.event,
    toJson(payload),
    status,
    responseCode,
    error
  ).catch(() => {});
}
