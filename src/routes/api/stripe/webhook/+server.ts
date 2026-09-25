import { getStripe, getWebhookSecret, subscriptionPeriod } from '$lib/stripe';
import { dbRun } from '$lib/db/index';
import type { SubscriptionStatus } from '$lib/db/index';
import { planFromAmount } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { enforcePlanLimits } from '$lib/limits';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';
import type { D1Database } from '@cloudflare/workers-types';

/** Map a Stripe subscription status onto what the `subscriptions` table can store
 *  (its CHECK allows only five values) and whether the org keeps its paid plan.
 *  Statuses that mean "not paid" must drop the org to Free — they used to fall
 *  through to `active`, which left an org whose payment never went through on the
 *  paid plan indefinitely. */
function syncState(stripeStatus: Stripe.Subscription.Status): { status: SubscriptionStatus; paid: boolean } {
  switch (stripeStatus) {
    case 'active':   return { status: 'active', paid: true };
    case 'trialing': return { status: 'trialing', paid: true };
    // Stripe is still retrying the charge — keep access through the retry window.
    case 'past_due': return { status: 'past_due', paid: true };
    // First payment still being confirmed (3-D Secure, bank debits). Webhooks are
    // unordered, so this can land AFTER the `active` event and must not revoke the
    // plan. If the payment never completes, `incomplete_expired` follows.
    case 'incomplete': return { status: 'active', paid: true };
    // Retries exhausted, subscription left open: no access until the invoice is paid.
    case 'unpaid': return { status: 'past_due', paid: false };
    // The first payment never succeeded.
    case 'incomplete_expired': return { status: 'cancelled', paid: false };
    case 'canceled': return { status: 'cancelled', paid: false };
    case 'paused':   return { status: 'paused', paid: false };
    // A status newer than this code — keep the old behaviour rather than locking
    // out a customer who may well be paying.
    default:         return { status: 'active', paid: true };
  }
}

async function handleSubscriptionEvent(sub: Stripe.Subscription, db: D1Database) {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  const amount = sub.items.data[0]?.price?.unit_amount ?? 0;
  const { status, paid } = syncState(sub.status);
  // The ACTIVE price amount is the source of truth for the plan — this is what
  // makes a scheduled (period-end) downgrade sync correctly when its phase goes
  // live and the price drops. Metadata is only a fallback. Not paid → free.
  const plan: PlanId = paid
    ? (planFromAmount(amount) ?? (sub.metadata?.plan as PlanId | undefined) ?? 'free')
    : 'free';
  const { end } = subscriptionPeriod(sub);
  const periodEnd = end ? new Date(end * 1000).toISOString() : null;

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
  await enforcePlanLimits(db, orgId, plan);
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
    // Must be the async variant. The Worker bundle gets Stripe's worker build (the
    // adapter resolves the `workerd` export condition), whose Web Crypto provider
    // cannot compute an HMAC synchronously: the sync `constructEvent` throws on
    // every call there, even for a correctly signed event, so every webhook was
    // rejected and a completed checkout never upgraded the org.
    stripeEvent = await client.webhooks.constructEventAsync(body, sig, webhookSecret);
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
