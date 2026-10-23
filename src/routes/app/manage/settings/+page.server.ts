import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canManageSettings } from '$lib/server/settings-access';
import { PLANS, type PlanId } from '$lib/plans';

/**
 * Settings has no page of its own: it opens on the tab with the most to do there.
 *   - A plan with its own site (Starter and up): the public site, the venue's face.
 *   - Free: Advanced, where the email notifications are. Every other tab is a paid
 *     feature, and Settings used to open on Domains, a locked upsell for them.
 *   - A member who may not manage settings: Advanced, the one tab with something for
 *     them (leaving the organisation).
 */
export const load: PageServerLoad = async ({ locals }) => {
  if (!(await canManageSettings(locals))) redirect(307, '/app/manage/settings/advanced');
  const plan = locals.currentOrg?.subscription?.plan as PlanId | undefined;
  const ownSite = !!plan && (PLANS[plan]?.limits.customBranding ?? false);
  redirect(307, ownSite ? '/app/manage/settings/site' : '/app/manage/settings/advanced');
};
