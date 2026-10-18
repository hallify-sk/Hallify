import { redirect } from '@sveltejs/kit';
import { dbFirst, fromJson } from '$lib/db/index';
import { PLANS, type PlanId } from '$lib/plans';
import { resolveTemplate, templateStyle } from '$lib/site-templates';
import { resolveSections } from '$lib/site-sections';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // /halls/* is only for custom-domain visitors. Redirect Hallify.app users to their dashboard.
  if (!locals.domainOrg) {
    redirect(303, '/app/halls');
  }

  const orgId = locals.domainOrg.id;

  // The bubble used to receive nothing but the org's id, name, slug and logo, which
  // is why every venue's public site looked identical. Branding and the chosen
  // template are loaded here so the whole subtree can be personalised.
  const [brandingRow, siteRow, sub] = await Promise.all([
    dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'`, orgId),
    dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'site'`, orgId),
    dbFirst<{ plan: string | null; status: string | null }>(locals.db,
      'SELECT plan, status FROM subscriptions WHERE org_id = ?', orgId)
  ]);

  const plan = (sub?.plan ?? 'free') as PlanId;
  // A lapsed subscription is not a paid one. Without the status check an org could
  // cancel and keep a premium template running indefinitely.
  const paidAndCurrent =
    (PLANS[plan]?.limits.customBranding ?? false) &&
    (sub?.status === 'active' || sub?.status === 'trialing');

  const branding = fromJson<Record<string, string>>(brandingRow?.value ?? null) ?? {};
  const site = fromJson<{ template?: string; tagline?: string; intro?: string; sections?: unknown }>(siteRow?.value ?? null) ?? {};

  // resolveTemplate falls back to the Hallify default when the stored id is unknown
  // or the plan no longer includes it, so a downgrade quietly reverts a live public
  // site instead of breaking it.
  const template = resolveTemplate(site.template, paidAndCurrent);

  return {
    domainOrg: locals.domainOrg,
    branding: paidAndCurrent ? branding : {},
    site: {
      template: template.id,
      templateStyle: templateStyle(template),
      headingFont: template.tokens.headingFont,
      tagline: paidAndCurrent ? (site.tagline ?? '') : '',
      intro: paidAndCurrent ? (site.intro ?? '') : '',
      // Arrangement follows the same plan rule as the look: a free site gets the
      // default page rather than a half-applied custom one.
      sections: resolveSections(paidAndCurrent ? site.sections : null)
    },
    canCustomize: paidAndCurrent
  };
};
