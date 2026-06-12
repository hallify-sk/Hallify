import { stripe, STRIPE_WEBHOOK_SECRET } from '$lib/stripe';
import sql from '$lib/db';
import type { RequestHandler } from './$types';
import type Stripe from 'stripe';

type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'paused';

function toPlanId(priceId: string): string {
  // Map Stripe price IDs back to plan names via env vars
  const { STRIPE_PRICE_STARTER, STRIPE_PRICE_PROFESSIONAL } = process.env;
  if (priceId === STRIPE_PRICE_STARTER) return 'starter';
  if (priceId === STRIPE_PRICE_PROFESSIONAL) return 'professional';
  return 'free';
}

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

async function handleSubscriptionEvent(sub: Stripe.Subscription) {
  const orgId = sub.metadata?.orgId;
  if (!orgId) return;

  const priceId = sub.items.data[0]?.price?.id ?? '';
  const plan   = toPlanId(priceId);
  const status = toStatus(sub.status);
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  await sql`
    INSERT INTO subscriptions (org_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at)
    VALUES (${orgId}, ${plan}, ${status}, ${sub.customer as string}, ${sub.id}, ${periodEnd}, NOW())
    ON CONFLICT (org_id) DO UPDATE
      SET plan = ${plan},
          status = ${status},
          stripe_customer_id = ${sub.customer as string},
          stripe_subscription_id = ${sub.id},
          current_period_end = ${periodEnd},
          updated_at = NOW()
  `;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const sig  = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response('Webhook signature invalid', { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionEvent(event.data.object as Stripe.Subscription);
      break;

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Set stripe_customer_id on subscriptions for new checkouts
      if (session.subscription && session.customer && session.metadata?.orgId) {
        await sql`
          UPDATE subscriptions SET stripe_customer_id = ${session.customer as string}
          WHERE org_id = ${session.metadata.orgId}
        `;
      }
      break;
    }
  }

  return new Response('ok');
};
