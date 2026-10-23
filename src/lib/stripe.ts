import Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { PLANS, planFromAmount, comparePlanPrice } from '$lib/plans';
import type { PlanId } from '$lib/plans';

// Secrets are read at RUNTIME from Worker secrets / `.env`, never inlined at build
// time. `$env/static/private` would bake the literal key into `_worker.js` (and its
// sourcemap), which meant the deployed key was whatever sat in the builder's `.env`
// and `wrangler secret put STRIPE_SECRET_KEY` had no effect. Runtime env is also why
// the client is built lazily: `$env/dynamic/private` is empty at module-init time.
let _stripe: Stripe | null = null;

/** The Stripe client, constructed on first use from runtime env. */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
    // Pinned to basil on purpose — previewPlanChange uses invoices.retrieveUpcoming,
    // which the dahlia SDK renamed. The cast keeps the pin while the types move on.
    _stripe = new Stripe(key, { apiVersion: '2025-05-28.basil' } as unknown as ConstructorParameters<typeof Stripe>[1]);
  }
  return _stripe;
}

/** Webhook signing secret, read at runtime. Throws if unset so a misconfigured
 *  deployment fails loudly instead of silently accepting unverified events. */
export function getWebhookSecret(): string {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return secret;
}

/** Base URL for Stripe redirect targets. */
function appUrl(): string {
  return env.APP_URL ?? '';
}

/** Create a Stripe Checkout session for upgrading an org to a paid plan.
 *  Price + product name/description are taken from `plans.ts` (single source of
 *  truth) via inline `price_data`, so Stripe always charges the current price. */
export async function createCheckoutSession(opts: {
  orgId: string;
  plan: PlanId;
  stripeCustomerId: string | null;
  userEmail: string;
}): Promise<string> {
  const plan = PLANS[opts.plan];
  if (!plan || plan.priceMonthly == null || plan.priceMonthly <= 0) {
    throw new Error(`Plan "${opts.plan}" is not a paid plan`);
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(plan.priceMonthly * 100),
        recurring: { interval: 'month' },
        product_data: {
          name: `Hallify ${plan.name}`,
          description: `Includes: ${plan.features.join(' · ')}.`,
        },
      },
    }],
    // Stripe fills in the session id; the success page verifies it against Stripe
    // instead of trusting a plan named in the query string.
    success_url: `${appUrl()}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/app/billing?cancelled=1`,
    allow_promotion_codes: true,
    metadata: { orgId: opts.orgId, plan: opts.plan },
    subscription_data: { metadata: { orgId: opts.orgId, plan: opts.plan } },
  };

  if (opts.stripeCustomerId) {
    params.customer = opts.stripeCustomerId;
  } else {
    params.customer_email = opts.userEmail;
  }

  const session = await getStripe().checkout.sessions.create(params);
  return session.url!;
}

/** What the platform-admin test payment charges: €1 a month. */
export const TEST_PAYMENT_CENTS = 100;

/**
 * A live end-to-end check of payments, for platform admins: a real Checkout for the
 * Starter plan at €1 a month, marked as a test. It takes exactly the path a real
 * upgrade takes (Checkout, the webhook, plan activation, the success page); the plan
 * comes from the subscription metadata because €1 matches no plan price. Cancel it in
 * the billing portal afterwards and refund the €1 in Stripe.
 */
export async function createTestCheckoutSession(opts: {
  orgId: string;
  stripeCustomerId: string | null;
  userEmail: string;
}): Promise<string> {
  const meta = { orgId: opts.orgId, plan: 'starter', test: '1' };
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: TEST_PAYMENT_CENTS,
        recurring: { interval: 'month' },
        product_data: {
          name: 'Hallify Starter – test payment',
          description: 'A €1 test of the payment path, for Hallify platform admins. Cancel the subscription after the test.',
        },
      },
    }],
    success_url: `${appUrl()}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/app/billing?cancelled=1`,
    metadata: meta,
    subscription_data: { metadata: meta },
  };
  if (opts.stripeCustomerId) params.customer = opts.stripeCustomerId;
  else params.customer_email = opts.userEmail;
  const session = await getStripe().checkout.sessions.create(params);
  return session.url!;
}

export { AI_CREDIT_PACKS } from './ai-credits';
import { AI_CREDIT_PACKS, CENTS_PER_CREDIT } from './ai-credits';

/** One-off Checkout for a pack of AI credits. The credits are added by the webhook
 *  on `checkout.session.completed`, keyed on the session id, never by the redirect. */
export async function createAiTopupSession(opts: {
  orgId: string;
  userId: string;
  credits: number;
  stripeCustomerId: string | null;
  userEmail: string;
}): Promise<string> {
  if (!(AI_CREDIT_PACKS as readonly number[]).includes(opts.credits)) throw new Error('Unknown credit pack');
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: opts.credits * CENTS_PER_CREDIT,
        product_data: {
          name: `Hallify AI credits × ${opts.credits}`,
          description: 'Credits for the Hallify AI assistant. They never expire.',
        },
      },
    }],
    success_url: `${appUrl()}/app/manage/settings/ai?topup={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl()}/app/manage/settings/ai`,
    metadata: { orgId: opts.orgId, kind: 'ai_credits', credits: String(opts.credits), userId: opts.userId },
  };
  if (opts.stripeCustomerId) params.customer = opts.stripeCustomerId;
  else params.customer_email = opts.userEmail;
  const session = await getStripe().checkout.sessions.create(params);
  return session.url!;
}

/** A Checkout session with its subscription expanded, or null if it can't be fetched
 *  (unknown id, Stripe unreachable). Used by the pages Stripe redirects back to. */
export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return null;
  try {
    return await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
  } catch {
    return null;
  }
}

/** Create a Stripe Billing Portal session for managing an existing subscription. */
export async function createPortalSession(stripeCustomerId: string, returnPath = '/app/billing'): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl()}${returnPath}`,
  });
  return session.url;
}

/** Schedule a subscription to cancel at the end of the current billing period. */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/** Undo a scheduled cancellation. */
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  await getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

/** Retrieve a subscription, or null if it can't be fetched. */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await getStripe().subscriptions.retrieve(subscriptionId);
  } catch {
    return null;
  }
}

/** Get (or lazily create) a recurring Price for a plan, keyed by plan + amount so
 *  proration / scheduling can reference a stable Price id. Price details still come
 *  from `plans.ts`; changing a plan's price simply mints a new Price (new key). */
export async function getOrCreatePrice(plan: PlanId): Promise<string> {
  const p = PLANS[plan];
  if (!p || p.priceMonthly == null || p.priceMonthly <= 0) {
    throw new Error(`Plan "${plan}" is not a paid plan`);
  }
  const amount = Math.round(p.priceMonthly * 100);
  const lookupKey = `hallify_${plan}_eur_${amount}`;
  const existing = await getStripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const price = await getStripe().prices.create({
    currency: 'eur',
    unit_amount: amount,
    recurring: { interval: 'month' },
    lookup_key: lookupKey,
    product_data: { name: `Hallify ${p.name}` },
  });
  return price.id;
}

/** Switch an existing subscription to another paid plan, fairly:
 *  - Upgrade   → apply now and invoice only the prorated difference immediately.
 *  - Downgrade → schedule the cheaper price to start at the end of the paid period
 *                (no charge now; the org keeps the higher tier until then).
 *  Returns which path was taken. */
export async function changeSubscriptionPlan(opts: {
  orgId: string;
  subscriptionId: string;
  currentPlan: PlanId;
  newPlan: PlanId;
}): Promise<'upgraded' | 'downgrade_scheduled'> {
  const sub = await getStripe().subscriptions.retrieve(opts.subscriptionId);
  const item = sub.items.data[0];
  const newPriceId = await getOrCreatePrice(opts.newPlan);
  const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;

  // Upgrade (or sideways) — release any pending downgrade, switch now, charge the
  // prorated difference for the remaining days immediately.
  if (comparePlanPrice(opts.newPlan, opts.currentPlan) >= 0) {
    if (scheduleId) {
      try { await getStripe().subscriptionSchedules.release(scheduleId); } catch { /* already released */ }
    }
    await getStripe().subscriptions.update(opts.subscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
      metadata: { orgId: opts.orgId, plan: opts.newPlan },
    });
    return 'upgraded';
  }

  // Downgrade — schedule the new (cheaper) price to begin at the current period end.
  let sid = scheduleId;
  if (!sid) {
    const created = await getStripe().subscriptionSchedules.create({ from_subscription: opts.subscriptionId });
    sid = created.id;
  }
  const schedule = await getStripe().subscriptionSchedules.retrieve(sid);
  const phase0 = schedule.phases[0];
  const currentPriceId = typeof item.price === 'string' ? item.price : item.price.id;
  await getStripe().subscriptionSchedules.update(sid, {
    end_behavior: 'release',
    proration_behavior: 'none',
    phases: [
      {
        items: [{ price: currentPriceId, quantity: 1 }],
        start_date: phase0.start_date,
        end_date: phase0.end_date,
      },
      {
        items: [{ price: newPriceId, quantity: 1 }],
        metadata: { orgId: opts.orgId, plan: opts.newPlan },
      },
    ],
  });
  return 'downgrade_scheduled';
}

/** Preview what an upgrade would charge right now (the prorated difference for the
 *  days left in the current period). Uses Stripe's upcoming-invoice preview; if that
 *  call isn't available, falls back to a local proration estimate. */
export async function previewPlanChange(opts: {
  subscriptionId: string;
  currentPlan: PlanId;
  newPlan: PlanId;
}): Promise<{ amountDue: number; currency: string; exact: boolean }> {
  // Everything that talks to Stripe must be inside the try: these two calls used to
  // sit outside it, so an unreachable Stripe 500'd the whole billing page instead of
  // falling back to the local proration estimate below.
  let sub: Stripe.Subscription;
  let item: Stripe.SubscriptionItem;
  let newPriceId: string;
  try {
    sub = await getStripe().subscriptions.retrieve(opts.subscriptionId);
    item = sub.items.data[0];
    newPriceId = await getOrCreatePrice(opts.newPlan);
  } catch {
    // No live data — estimate from plans.ts alone.
    const diff = (PLANS[opts.newPlan].priceMonthly ?? 0) - (PLANS[opts.currentPlan].priceMonthly ?? 0);
    return { amountDue: Math.round(Math.max(0, diff) * 100), currency: 'eur', exact: false };
  }
  const now = Math.floor(Date.now() / 1000);

  try {
    // `retrieveUpcoming` is present at runtime on the basil API; cast around the
    // (dahlia) SDK types which renamed it.
    const inv = await (getStripe().invoices as unknown as {
      retrieveUpcoming: (p: Record<string, unknown>) => Promise<Stripe.Invoice>;
    }).retrieveUpcoming({
      customer: sub.customer as string,
      subscription: opts.subscriptionId,
      subscription_items: [{ id: item.id, price: newPriceId }],
      subscription_proration_behavior: 'always_invoice',
      subscription_proration_date: now,
    });
    // The immediate charge is the net of the proration line items (new charge minus
    // the credit for unused time on the old price).
    const amount = inv.lines.data
      .filter((l: Stripe.InvoiceLineItem) => (l as unknown as { proration?: boolean }).proration)
      .reduce((s: number, l: Stripe.InvoiceLineItem) => s + l.amount, 0);
    return { amountDue: Math.max(0, amount), currency: inv.currency ?? 'eur', exact: true };
  } catch {
    const s = sub as unknown as { current_period_start: number; current_period_end: number };
    const total = s.current_period_end - s.current_period_start;
    const remaining = Math.max(0, s.current_period_end - now);
    const frac = total > 0 ? remaining / total : 0;
    const diff = (PLANS[opts.newPlan].priceMonthly ?? 0) - (PLANS[opts.currentPlan].priceMonthly ?? 0);
    return { amountDue: Math.round(Math.max(0, diff) * frac * 100), currency: 'eur', exact: false };
  }
}

/** Cancel a scheduled (period-end) plan change, keeping the current plan. */
export async function cancelScheduledChange(subscriptionId: string): Promise<void> {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const sid = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
  if (sid) {
    try { await getStripe().subscriptionSchedules.release(sid); } catch { /* already gone */ }
  }
}

/** If a period-end downgrade is scheduled, return the target plan + when it starts. */
export async function getPendingPlanChange(
  sub: Stripe.Subscription
): Promise<{ plan: PlanId; effective: string } | null> {
  const sid = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
  if (!sid) return null;
  try {
    const sched = await getStripe().subscriptionSchedules.retrieve(sid);
    const nowS = Math.floor(Date.now() / 1000);
    const future = sched.phases.find((p) => p.start_date > nowS);
    if (!future) return null;
    const priceRef = future.items[0]?.price;
    const priceId = typeof priceRef === 'string' ? priceRef : priceRef?.id;
    if (!priceId) return null;
    const price = await getStripe().prices.retrieve(priceId);
    const plan = planFromAmount(price.unit_amount ?? 0);
    if (!plan) return null;
    return { plan, effective: new Date(future.start_date * 1000).toISOString() };
  } catch {
    return null;
  }
}

/** List a customer's invoices (best-effort; for archiving). Returns [] on error. */
export async function listInvoices(customerId: string, limit = 100): Promise<Array<{
  id: string; number: string | null; status: string | null;
  amount_due: number; amount_paid: number; currency: string; created: number;
  hosted_invoice_url: string | null; invoice_pdf: string | null;
}>> {
  try {
    const res = await getStripe().invoices.list({ customer: customerId, limit });
    return res.data.map(inv => ({
      id: inv.id ?? '', number: inv.number ?? null, status: inv.status ?? null,
      amount_due: inv.amount_due, amount_paid: inv.amount_paid, currency: inv.currency, created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url ?? null, invoice_pdf: inv.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}
