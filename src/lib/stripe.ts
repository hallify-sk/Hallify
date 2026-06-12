import Stripe from 'stripe';
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_STARTER,
  STRIPE_PRICE_PROFESSIONAL,
  APP_URL,
} from '$env/static/private';
import type { PlanId } from '$lib/plans';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-05-28.basil',
});

export { STRIPE_WEBHOOK_SECRET };

const PRICE_IDS: Partial<Record<PlanId, string>> = {
  starter: STRIPE_PRICE_STARTER,
  professional: STRIPE_PRICE_PROFESSIONAL,
};

/** Create a Stripe Checkout session for upgrading an org to a paid plan. */
export async function createCheckoutSession(opts: {
  orgId: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  userEmail: string;
  returnPath?: string;
}): Promise<string> {
  const priceId = PRICE_IDS[opts.plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${opts.plan}`);

  const successUrl = `${APP_URL}${opts.returnPath ?? '/billing'}?success=1`;
  const cancelUrl  = `${APP_URL}${opts.returnPath ?? '/billing'}?cancelled=1`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orgId: opts.orgId },
    subscription_data: { metadata: { orgId: opts.orgId } },
  };

  if (opts.stripeCustomerId) {
    params.customer = opts.stripeCustomerId;
  } else {
    params.customer_email = opts.userEmail;
  }

  const session = await stripe.checkout.sessions.create(params);
  return session.url!;
}

/** Create a Stripe Billing Portal session for managing an existing subscription. */
export async function createPortalSession(stripeCustomerId: string, returnPath = '/billing'): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}${returnPath}`,
  });
  return session.url;
}
