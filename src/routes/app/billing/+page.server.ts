import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
  createCheckoutSession, createPortalSession, cancelSubscription, resumeSubscription,
  getSubscription, changeSubscriptionPlan, cancelScheduledChange, getPendingPlanChange,
  previewPlanChange,
} from '$lib/stripe';
import { dbFirst } from '$lib/db/index';
import { PLANS, comparePlanPrice } from '$lib/plans';
import { st } from '$lib/i18n-server';
import type { PlanId } from '$lib/plans';
import type { D1Database } from '@cloudflare/workers-types';
import { requireOrgOwner } from '$lib/guards';

async function getSubId(db: D1Database, orgId: string): Promise<string | null> {
  const row = await dbFirst<{ stripe_subscription_id: string | null }>(db,
    'SELECT stripe_subscription_id FROM subscriptions WHERE org_id = ?', orgId);
  return row?.stripe_subscription_id ?? null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (!locals.currentOrg) redirect(303, '/app/org/new');

  // Reflect a scheduled cancellation or a scheduled period-end downgrade
  // (read live from Stripe; best-effort).
  let cancelAtPeriodEnd = false;
  let pendingDowngrade: { plan: PlanId; planName: string; effective: string } | null = null;
  // Prorated immediate-charge previews for each plan that would be an UPGRADE from
  // the current one — shown in the confirm dialog so charges are never a surprise.
  const previews: Record<string, { amountDue: number; currency: string; exact: boolean }> = {};
  const currentPlan = locals.currentOrg.subscription.plan as PlanId;
  if (currentPlan !== 'free' && locals.currentOrg.subscription.stripeCustomerId) {
    const subId = await getSubId(locals.db, locals.currentOrg.id);
    if (subId) {
      const sub = await getSubscription(subId);
      cancelAtPeriodEnd = sub?.cancel_at_period_end ?? false;
      if (sub && !cancelAtPeriodEnd) {
        const pending = await getPendingPlanChange(sub);
        if (pending) pendingDowngrade = { ...pending, planName: PLANS[pending.plan].name };
      }
      for (const pid of ['starter', 'professional'] as PlanId[]) {
        if (comparePlanPrice(pid, currentPlan) > 0) {
          previews[pid] = await previewPlanChange({ subscriptionId: subId, currentPlan, newPlan: pid });
        }
      }
    }
  }

  return {
    currentOrg: locals.currentOrg,
    plans: PLANS,
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
  // Pick a paid plan. A first-time subscriber (currently Free) goes through
  // Checkout; an org that already has a paid subscription has THAT subscription
  // changed in place — upgrades prorate + charge the difference now, downgrades
  // are scheduled for the period end (no new subscription, no full re-charge).
  upgrade: async ({ request, locals }) => {
    requireOrgOwner(locals);
    if (!locals.user || !locals.currentOrg) redirect(303, '/app/login');
    const data = await request.formData();
    const plan = (data.get('plan') as PlanId) ?? 'starter';
    if (plan !== 'starter' && plan !== 'professional') return fail(400, { error: st(locals.locale).serverErrors.invalidPlan });

    const currentPlan = locals.currentOrg.subscription.plan as PlanId;
    const subId = await getSubId(locals.db, locals.currentOrg.id);

    // First paid subscription → Checkout (creates the subscription).
    if (currentPlan === 'free' || !subId) {
      const checkoutUrl = await createCheckoutSession({
        orgId:            locals.currentOrg.id,
        plan,
        stripeCustomerId: locals.currentOrg.subscription.stripeCustomerId,
        userEmail:        locals.user.email,
      });
      redirect(303, checkoutUrl);
    }

    if (plan === currentPlan) return fail(400, { error: st(locals.locale).serverErrors.alreadyOnThisPlan });

    // Existing subscription → change it in place (fair proration / scheduling).
    const result = await changeSubscriptionPlan({
      orgId: locals.currentOrg.id, subscriptionId: subId, currentPlan, newPlan: plan,
    });
    redirect(303, result === 'upgraded' ? '/app/billing?upgraded=1' : '/app/billing?downgrade_scheduled=1');
  },

  // Undo a scheduled period-end downgrade — stay on the current plan.
  cancelScheduledChange: async ({ locals }) => {
    requireOrgOwner(locals);
    if (!locals.currentOrg) redirect(303, '/app/login');
    const subId = await getSubId(locals.db, locals.currentOrg.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noSubscriptionToUpdate });
    await cancelScheduledChange(subId);
    redirect(303, '/app/billing?change_reverted=1');
  },

  manage: async ({ locals }) => {
    requireOrgOwner(locals);
    if (!locals.currentOrg?.subscription.stripeCustomerId) redirect(303, '/app/billing');
    const portalUrl = await createPortalSession(locals.currentOrg.subscription.stripeCustomerId);
    redirect(303, portalUrl);
  },

  // Cancel at period end — the org keeps its plan until the period ends, then
  // reverts to Free (handled by the subscription.deleted webhook).
  cancel: async ({ locals }) => {
    requireOrgOwner(locals);
    if (!locals.currentOrg) redirect(303, '/app/login');
    const subId = await getSubId(locals.db, locals.currentOrg.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noActiveSubscriptionToCancel });
    await cancelSubscription(subId);
    redirect(303, '/app/billing?cancel_scheduled=1');
  },

  // Undo a scheduled cancellation.
  resume: async ({ locals }) => {
    requireOrgOwner(locals);
    if (!locals.currentOrg) redirect(303, '/app/login');
    const subId = await getSubId(locals.db, locals.currentOrg.id);
    if (!subId) return fail(400, { error: st(locals.locale).serverErrors.noSubscriptionToResume });
    await resumeSubscription(subId);
    redirect(303, '/app/billing?resumed=1');
  },
};
