import { createHmac } from 'crypto';
import sql from '$lib/db';
import type { WebhookEvent } from '$lib/db';

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
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  let webhooks: { id: string; url: string; secret: string | null }[] = [];
  try {
    webhooks = await sql<{ id: string; url: string; secret: string | null }[]>`
      SELECT id, url, secret FROM org_webhooks
      WHERE org_id = ${orgId}
        AND enabled = true
        AND ${event} = ANY(events)
    `;
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
    deliver(wh.id, wh.url, wh.secret, payload).catch(() => {});
  }
}

async function deliver(
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

  await sql`
    INSERT INTO webhook_deliveries (webhook_id, event, payload, status, response_code, error)
    VALUES (${webhookId}, ${payload.event}, ${sql.json(payload as object)}, ${status}, ${responseCode}, ${error})
  `.catch(() => {});
}
