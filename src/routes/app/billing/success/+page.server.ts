import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { PLANS } from '$lib/plans';

export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user) redirect(303, '/app/login');

  const planParam = url.searchParams.get('plan');
  const plan = planParam && planParam in PLANS ? PLANS[planParam as keyof typeof PLANS] : null;

  return {
    planName: plan?.name ?? null,
    orgName: locals.currentOrg?.name ?? null,
  };
};
