import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, APP_URL } from '$env/static/private';
import { PLANS, planFromAmount, comparePlanPrice } from '$lib/plans';
import type { PlanId } from '$lib/plans';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-05-28.basil',
});

export { STRIPE_WEBHOOK_SECRET };

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
    success_url: `${APP_URL}/app/billing/success?plan=${opts.plan}`,
    cancel_url: `${APP_URL}/app/billing?cancelled=1`,
    allow_promotion_codes: true,
    metadata: { orgId: opts.orgId, plan: opts.plan },
    subscription_data: { metadata: { orgId: opts.orgId, plan: opts.plan } },
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
export async function createPortalSession(stripeCustomerId: string, returnPath = '/app/billing'): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}${returnPath}`,
  });
  return session.url;
}

/** Schedule a subscription to cancel at the end of the current billing period. */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/** Undo a scheduled cancellation. */
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

/** Retrieve a subscription, or null if it can't be fetched. */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription | null> {
  try {
    return await stripe.subscriptions.retrieve(subscriptionId);
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
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const price = await stripe.prices.create({
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
  const sub = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const item = sub.items.data[0];
  const newPriceId = await getOrCreatePrice(opts.newPlan);
  const scheduleId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;

  // Upgrade (or sideways) — release any pending downgrade, switch now, charge the
  // prorated difference for the remaining days immediately.
  if (comparePlanPrice(opts.newPlan, opts.currentPlan) >= 0) {
    if (scheduleId) {
      try { await stripe.subscriptionSchedules.release(scheduleId); } catch { /* already released */ }
    }
    await stripe.subscriptions.update(opts.subscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
      metadata: { orgId: opts.orgId, plan: opts.newPlan },
    });
    return 'upgraded';
  }

  // Downgrade — schedule the new (cheaper) price to begin at the current period end.
  let sid = scheduleId;
  if (!sid) {
    const created = await stripe.subscriptionSchedules.create({ from_subscription: opts.subscriptionId });
    sid = created.id;
  }
  const schedule = await stripe.subscriptionSchedules.retrieve(sid);
  const phase0 = schedule.phases[0];
  const currentPriceId = typeof item.price === 'string' ? item.price : item.price.id;
  await stripe.subscriptionSchedules.update(sid, {
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
  const sub = await stripe.subscriptions.retrieve(opts.subscriptionId);
  const item = sub.items.data[0];
  const newPriceId = await getOrCreatePrice(opts.newPlan);
  const now = Math.floor(Date.now() / 1000);

  try {
    // `retrieveUpcoming` is present at runtime on the basil API; cast around the
    // (dahlia) SDK types which renamed it.
    const inv = await (stripe.invoices as unknown as {
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
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const sid = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
  if (sid) {
    try { await stripe.subscriptionSchedules.release(sid); } catch { /* already gone */ }
  }
}

/** If a period-end downgrade is scheduled, return the target plan + when it starts. */
export async function getPendingPlanChange(
  sub: Stripe.Subscription
): Promise<{ plan: PlanId; effective: string } | null> {
  const sid = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
  if (!sid) return null;
  try {
    const sched = await stripe.subscriptionSchedules.retrieve(sid);
    const nowS = Math.floor(Date.now() / 1000);
    const future = sched.phases.find((p) => p.start_date > nowS);
    if (!future) return null;
    const priceRef = future.items[0]?.price;
    const priceId = typeof priceRef === 'string' ? priceRef : priceRef?.id;
    if (!priceId) return null;
    const price = await stripe.prices.retrieve(priceId);
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
    const res = await stripe.invoices.list({ customer: customerId, limit });
    return res.data.map(inv => ({
      id: inv.id ?? '', number: inv.number ?? null, status: inv.status ?? null,
      amount_due: inv.amount_due, amount_paid: inv.amount_paid, currency: inv.currency, created: inv.created,
      hosted_invoice_url: inv.hosted_invoice_url ?? null, invoice_pdf: inv.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}
