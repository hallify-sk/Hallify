import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import type { PageServerLoad } from './$types';
import { getCheckoutSession } from '$lib/stripe';
import { applySubscription } from '$lib/server/stripe-sync';
import { planName, resolveStripePlan } from '$lib/billing';
import type Stripe from 'stripe';

/**
 * Where Stripe Checkout sends the owner back. The page used to believe a plan named
 * in the query string, so anyone could open "payment successful" (with confetti and
 * an analytics purchase) for a plan never paid for. Now it asks Stripe about the
 * session, checks it belongs to this organisation, and only then celebrates.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url));
  const org = locals.currentOrg;
  const sessionId = url.searchParams.get('session_id') ?? '';
  const session = org && sessionId ? await getCheckoutSession(sessionId) : null;

  if (!org || !session || session.mode !== 'subscription' || session.metadata?.orgId !== org.id) {
    return { state: 'unknown' as const, planName: null, planId: null, orgName: org?.name ?? null, sessionId: null, value: null };
  }

  // Apply the subscription as Stripe has it now, so the console shows the new plan
  // even if the webhook has not arrived yet (applying it twice is harmless).
  const sub = session.subscription && typeof session.subscription === 'object'
    ? (session.subscription as Stripe.Subscription)
    : null;
  if (sub) {
    try {
      await applySubscription(locals.db, sub, Math.floor(Date.now() / 1000));
    } catch (err) {
      console.error('[billing] could not apply the subscription on return from Checkout', err);
    }
  }

  const paid = session.status === 'complete'
    && (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
  const planId = resolveStripePlan(sub?.items?.data?.[0]?.price?.unit_amount ?? null, session.metadata?.plan, null);
  return {
    state: paid ? ('paid' as const) : ('pending' as const),
    planName: planId ? planName(planId) : null,
    planId,
    orgName: org.name,
    sessionId: session.id,
    value: session.amount_total != null ? session.amount_total / 100 : null,
    // The platform-admin €1 test (see createTestCheckoutSession) is not a sale.
    test: session.metadata?.test === '1',
  };
};
