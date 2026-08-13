import { getStripe, getWebhookSecret } from '$lib/stripe';
import { dbRun } from '$lib/db/index';
import { planFromAmount } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { enforcePlanLimits } from '$lib/limits';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';
import type { D1Database } from '@cloudflare/workers-types';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';

function toStatus(stripeStatus: string): SubscriptionStatus {
  const map: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'cancelled',
    paused: 'paused',
  };
  return map[stripeStatus] ?? 'active';
}

async function handleSubscriptionEvent(sub: Stripe.Subscription, db: D1Database) {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  const amount = sub.items.data[0]?.price?.unit_amount ?? 0;
  const status = toStatus(sub.status);
  // The ACTIVE price amount is the source of truth for the plan — this is what
  // makes a scheduled (period-end) downgrade sync correctly when its phase goes
  // live and the price drops. Metadata is only a fallback. Canceled → free.
  const plan = status === 'cancelled'
    ? 'free'
    : (planFromAmount(amount) ?? (sub.metadata?.plan as string) ?? 'free');
  // Present at runtime on the pinned basil API; the dahlia SDK types moved it off
  // Subscription, so read it through a narrow cast rather than changing API version.
  const currentPeriodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = currentPeriodEnd
    ? new Date(currentPeriodEnd * 1000).toISOString()
    : null;

  await dbRun(
    db,
    `INSERT INTO subscriptions (id, org_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT (org_id) DO UPDATE
       SET plan = excluded.plan,
           status = excluded.status,
           stripe_customer_id = excluded.stripe_customer_id,
           stripe_subscription_id = excluded.stripe_subscription_id,
           current_period_end = excluded.current_period_end,
           updated_at = datetime('now')`,
    crypto.randomUUID(), orgId, plan, status, sub.customer as string, sub.id, periodEnd,
  );

  // If the (new) plan allows fewer active halls than the org currently has, lock
  // them so the owner reactivates within the new limit (non-destructive).
  await enforcePlanLimits(db, orgId, plan as PlanId);
}

export const POST: RequestHandler = async (event) => {
  const { request, locals } = event;
  const db = locals.db;

  const body = await request.text();
  const sig  = request.headers.get('stripe-signature') ?? '';

  // Resolved outside the try so a missing key/secret surfaces as a 500 instead of
  // masquerading as an invalid signature (the catch below is deliberately blind).
  const client = getStripe();
  const webhookSecret = getWebhookSecret();

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = client.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return new Response('Webhook signature invalid', { status: 400 });
  }

  switch (stripeEvent.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionEvent(stripeEvent.data.object as Stripe.Subscription, db);
      break;

    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      if (session.subscription && session.customer && session.metadata?.orgId) {
        await dbRun(
          db,
          `UPDATE subscriptions SET stripe_customer_id = ? WHERE org_id = ?`,
          session.customer as string, session.metadata.orgId,
        );
      }
      break;
    }
  }

  return new Response('ok');
};
