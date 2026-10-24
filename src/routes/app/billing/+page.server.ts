import { redirect, fail, error } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import type { PageServerLoad, Actions } from './$types';
import { createCheckoutSession, createPortalSession, cancelSubscription, resumeSubscription, getSubscription, changeSubscriptionPlan, cancelScheduledChange, getPendingPlanChange, previewPlanChange } from '$lib/stripe';
import { dbFirst } from '$lib/db/index';
import { PLANS, comparePlanPrice } from '$lib/plans';
import { upgradeRoute } from '$lib/billing';
import { st } from '$lib/i18n-server';
import type { PlanId } from '$lib/plans';
import type { D1Database } from '@cloudflare/workers-types';
import { requireOrgPermission } from '$lib/server/access';
import { memberCan } from '$lib/server/ai/tools';
import { SETUP_SERVICE_PRICE_CENTS } from '$lib/setup-service';
import { openSetupRequest, createSetupRequest, cancelSetupRequest } from '$lib/server/setup-requests';
import { planUsage } from '$lib/server/plan-usage';
import { getAccount, allowanceCredits } from '$lib/server/ai/credits';
import { aiVisibilityFor } from '$lib/server/ai/availability';

async function getSubRow(db: D1Database, orgId: string) {
  return dbFirst<{ stripe_subscription_id: string | null; stripe_plan: string | null; stripe_status: string | null }>(db,
    'SELECT stripe_subscription_id, stripe_plan, stripe_status FROM subscriptions WHERE org_id = ?', orgId)
    // A database without migration 0015 has no stripe_plan / stripe_status yet.
    .catch(() => dbFirst<{ stripe_subscription_id: string | null; stripe_plan: string | null; stripe_status: string | null }>(db,
      'SELECT stripe_subscription_id, NULL AS stripe_plan, NULL AS stripe_status FROM subscriptions WHERE org_id = ?', orgId));
}

async function getSubId(db: D1Database, orgId: string): Promise<string | null> {
  return (await getSubRow(db, orgId))?.stripe_subscription_id ?? null;
}

/** Run a Stripe call; on failure log it and hand back a message for the page instead
 *  of the generic error page (nothing has changed when Stripe refuses). */
async function viaStripe<T>(locals: App.Locals, what: string, call: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await call() };
  } catch (err) {
    console.error(`[billing] ${what} failed`, err);
    return { ok: false, error: st(locals.locale).accountPages.stripeError };
  }
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url));
  if (!locals.currentOrg) redirect(303, '/app/org/new');
  const org = locals.currentOrg;

  // Changing the plan and payment details is `billing.manage` (the owner always has
  // it). Everyone else sees where the organisation stands, without buttons that
  // would only end on a 403 page.
  const canManage = await memberCan(locals, 'billing.manage');

  // Reflect a scheduled cancellation or a scheduled period-end downgrade
  // (read live from Stripe; best-effort).
  let cancelAtPeriodEnd = false;
  let pendingDowngrade: { plan: PlanId; planName: string; effective: string } | null = null;
  // Prorated immediate-charge previews for each plan that would be an UPGRADE from
  // the current one — shown in the confirm dialog so charges are never a surprise.
  const previews: Record<string, { amountDue: number; currency: string; exact: boolean }> = {};
  const currentPlan = org.subscription.plan as PlanId;
  const subRow = await getSubRow(locals.db, org.id);
  if (currentPlan !== 'free' && org.subscription.stripeCustomerId && subRow?.stripe_subscription_id) {
    const subId = subRow.stripe_subscription_id;
    const sub = await getSubscription(subId);
    cancelAtPeriodEnd = sub?.cancel_at_period_end ?? false;
    if (sub && !cancelAtPeriodEnd) {
      const pending = await getPendingPlanChange(sub);
      if (pending) pendingDowngrade = { ...pending, planName: PLANS[pending.plan].name };
    }
    if (canManage) {
      for (const pid of ['starter', 'professional'] as PlanId[]) {
        if (comparePlanPrice(pid, currentPlan) > 0) {
          previews[pid] = await previewPlanChange({ subscriptionId: subId, currentPlan, newPlan: pid });
        }
      }
    }
  }

  // The plan a suspended (unpaid / incomplete) Stripe subscription is for: the
  // organisation is on Free meanwhile, and the page says why.
  const suspendedPlan = subRow?.stripe_plan && subRow.stripe_plan !== currentPlan && org.subscription.status === 'paused'
    ? (subRow.stripe_plan as PlanId)
    : null;

  // A live subscription that is not paid up: choosing a plan would open a second
  // Checkout next to it (double billing), so the page offers settling it instead.
  const settleFirst = upgradeRoute({
    plan: currentPlan,
    status: org.subscription.status,
    stripeSubscriptionId: subRow?.stripe_subscription_id,
    stripeStatus: subRow?.stripe_status
  }) === 'settle';

  // AI credits are part of what a plan includes; best-effort (needs migration 0012).
  // Shown only while the assistant is on, on the platform and for this organisation.
  let ai: { balanceMc: number; allowance: number } | null = null;
  if ((await aiVisibilityFor(locals)).credits) try {
    const acc = await getAccount(locals.db, org);
    ai = { balanceMc: Math.max(0, acc.balance_mc), allowance: allowanceCredits(org, acc.allowance_override) };
  } catch { /* no assistant tables */ }

  // How many venues still have no floor plan, and whether there are any at all: the
  // mapping add-on is per venue, so an org that has mapped everything is told so,
  // and one with no venue yet is told to add one (it used to hear "all mapped").
  const venues = await dbFirst<{ total: number; unmapped: number }>(
    locals.db,
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN floorplan_json IS NULL THEN 1 ELSE 0 END), 0) AS unmapped
       FROM halls WHERE org_id = ? AND archived_at IS NULL`,
    org.id
  ).catch(() => null);

  return {
    currentOrg: org,
    canManage,
    canManageSettings: await memberCan(locals, 'settings.manage'),
    setupRequest: await openSetupRequest(locals.db, org.id),
    setupPriceCents: SETUP_SERVICE_PRICE_CENTS,
    totalVenues: venues?.total ?? 0,
    unmappedVenues: venues?.unmapped ?? 0,
    plans: PLANS,
    usage: await planUsage(locals.db, org.id),
    ai,
    stripeStatus: subRow?.stripe_status ?? null,
    suspendedPlan,
    settleFirst,
    cancelAtPeriodEnd,
    pendingDowngrade,
    previews,
    success:           url.searchParams.get('success') === '1',
    cancelled:         url.searchParams.get('cancelled') === '1',
    cancelScheduled:   url.searchParams.get('cancel_scheduled') === '1',
    resumed:           url.searchParams.get('resumed') === '1',
    upgraded:          url.searchParams.get('upgraded') === '1',
    downgradeScheduled: url.searchParams.get('downgrade_scheduled') === '1',
    changeReverted:    url.searchParams.get('change_reverted') === '1',
  };
};

export const actions: Actions = {
  /** Ask us to set the account up. Not a charge — we confirm and invoice on
   *  delivery — so this is gated on settings.manage rather than on billing, and
   *  matches the identical offer on the Help page. */
  requestSetup: async ({ request, locals }) => {
    const org = await requireOrgPermission(locals, 'settings.manage');
    const data = await request.formData();
    await createSetupRequest(locals, org, String(data.get('note') ?? ''));
    return { setupRequested: true };
  },

  /** Withdraw the setup request while we have not started on it. */
  cancelSetup: async ({ locals }) => {
    const org = await requireOrgPermission(locals, 'settings.manage');
    await cancelSetupRequest(locals, org);
    return { setupCancelled: true };
  },

  // Pick a paid plan. A first-time subscriber (currently Free) goes through
  // Checkout; an org that already has a paid subscription has THAT subscription
  // changed in place — upgrades prorate + charge the difference now, downgrades
  // are scheduled for the period end (no new subscription, no full re-charge).
  upgrade: async ({ request, locals }) => {
    const org = await requireOrgPermission(locals, 'billing.manage');
    const user = locals.user!;
    const data = await request.formData();
    const plan = (data.get('plan') as PlanId) ?? 'starter';
    if (plan !== 'starter' && plan !== 'professional') return fail(400, { error: st(locals.locale).serverErrors.invalidPlan });

    const currentPlan = org.subscription.plan as PlanId;
    const subRow = await getSubRow(locals.db, org.id);
    const subId = subRow?.stripe_subscription_id ?? null;
    const route = upgradeRoute({
      plan: currentPlan,
      status: org.subscription.status,
      stripeSubscriptionId: subId,
      stripeStatus: subRow?.stripe_status
    });

    // A suspended subscription is settled where it lives, in the billing portal: a
    // Checkout here would create a second subscription and bill twice (B89).
    if (route === 'settle') {
      const customerId = org.subscription.stripeCustomerId;
      if (!customerId) return fail(409, { error: st(locals.locale).accountPages.settleFirstError });
      const res = await viaStripe(locals, 'billing portal', () => createPortalSession(customerId));
      if (!res.ok) return fail(502, { error: res.error });
      redirect(303, res.value);
    }

    // First paid subscription → Checkout (creates the subscription).
    if (route === 'checkout' || !subId) {
      const res = await viaStripe(locals, 'checkout', () => createCheckoutSession({
        orgId:            org.id,
        plan,
        stripeCustomerId: org.subscription.stripeCustomerId,
        userEmail:        user.email,
      }));
      if (!res.ok) return fail(502, { error: res.error });
      redirect(303, res.value);
    }

    if (plan === currentPlan) return fail(400, { error: st(locals.locale).serverErrors.alreadyOnThisPlan });

    // Existing subscription → change it in place (fair proration / scheduling).
    const res = await viaStripe(locals, 'plan change', () => changeSubscriptionPlan({
      orgId: org.id, subscriptionId: subId, currentPlan, newPlan: plan,
    }));
    if (!res.ok) return fail(502, { error: res.error });
    redirect(303, res.value === 'upgraded' ? '/app/billing?upgraded=1' : '/app/billing?downgrade_scheduled=1');
  },

  // Undo a scheduled period-end downgrade — stay on the current plan.
  cancelScheduledChange: async ({ locals }) => {
    const org = await requireOrgPermission(locals, 'billing.manage');
    const subId = await getSubId(locals.db, org.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noSubscriptionToUpdate });
    const res = await viaStripe(locals, 'cancel scheduled change', () => cancelScheduledChange(subId));
    if (!res.ok) return fail(502, { error: res.error });
    redirect(303, '/app/billing?change_reverted=1');
  },

  manage: async ({ locals }) => {
    const org = await requireOrgPermission(locals, 'billing.manage');
    const customerId = org.subscription.stripeCustomerId;
    if (!customerId) redirect(303, '/app/billing');
    const res = await viaStripe(locals, 'billing portal', () => createPortalSession(customerId));
    if (!res.ok) return fail(502, { error: res.error });
    redirect(303, res.value);
  },

  // Cancel at period end — the org keeps its plan until the period ends, then
  // reverts to Free (handled by the subscription.deleted webhook).
  cancel: async ({ locals }) => {
    const org = await requireOrgPermission(locals, 'billing.manage');
    const subId = await getSubId(locals.db, org.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noActiveSubscriptionToCancel });
    const res = await viaStripe(locals, 'cancel', () => cancelSubscription(subId));
    if (!res.ok) return fail(502, { error: res.error });
    redirect(303, '/app/billing?cancel_scheduled=1');
  },

  // Undo a scheduled cancellation.
  resume: async ({ locals }) => {
    const org = await requireOrgPermission(locals, 'billing.manage');
    const subId = await getSubId(locals.db, org.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noSubscriptionToResume });
    const res = await viaStripe(locals, 'resume', () => resumeSubscription(subId));
    if (!res.ok) return fail(502, { error: res.error });
    redirect(303, '/app/billing?resumed=1');
  },
};
