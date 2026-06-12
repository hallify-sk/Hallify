import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createCheckoutSession, createPortalSession } from '$lib/stripe';
import { PLANS } from '$lib/plans';
import type { PlanId } from '$lib/plans';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (!locals.currentOrg) redirect(303, '/app/org/new');

  const success   = url.searchParams.get('success') === '1';
  const cancelled = url.searchParams.get('cancelled') === '1';

  return {
    currentOrg: locals.currentOrg,
    plans: PLANS,
    success,
    cancelled,
  };
};

export const actions: Actions = {
  upgrade: async ({ request, locals }) => {
    if (!locals.user || !locals.currentOrg) redirect(303, '/app/login');

    const data = await request.formData();
    const plan = (data.get('plan') as PlanId) ?? 'starter';

    const url = await createCheckoutSession({
      orgId:            locals.currentOrg.id,
      plan,
      stripeCustomerId: locals.currentOrg.subscription.stripeCustomerId,
      userEmail:        locals.user.email,
      returnPath:       '/billing',
    });

    redirect(303, url);
  },

  manage: async ({ locals }) => {
    if (!locals.currentOrg?.subscription.stripeCustomerId) {
      redirect(303, '/billing');
    }
    const url = await createPortalSession(locals.currentOrg.subscription.stripeCustomerId);
    redirect(303, url);
  }
};
