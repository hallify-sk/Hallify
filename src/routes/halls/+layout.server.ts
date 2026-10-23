import { redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, fromJson } from '$lib/db/index';
import { PLANS, type PlanId } from '$lib/plans';
import { resolveTemplate, templateStyle } from '$lib/site-templates';
import { resolveSections } from '$lib/site-sections';
import { brandAccentStyle, brandLogo, brandName } from '$lib/site/brand';
import type { CustomAmenity } from '$lib/site/amenities';
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
  const [brandingRow, siteRow, sub, customAmenities] = await Promise.all([
    dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'`, orgId),
    dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'site'`, orgId),
    dbFirst<{ plan: string | null; status: string | null }>(locals.db,
      'SELECT plan, status FROM subscriptions WHERE org_id = ?', orgId),
    // The operator's own amenities, so the public pages can name them instead of
    // printing 'custom-virivka'. Optional: an older database has no such table.
    dbAll<CustomAmenity>(locals.db,
      'SELECT slug, label_sk, label_en FROM org_amenities WHERE org_id = ?', orgId).catch(() => [] as CustomAmenity[])
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

  // Branding from Prispôsobenie (display name, logo, accent) reaches the guests too,
  // under the same plan rule as the template. The accent is written AFTER the
  // template's tokens, which otherwise win over the accent the root layout sets.
  const applied = paidAndCurrent ? branding : {};

  return {
    // The name and logo every page under /halls shows for the venue.
    domainOrg: {
      ...locals.domainOrg,
      name: brandName(applied, locals.domainOrg.name),
      logoUrl: brandLogo(applied, locals.domainOrg.logoUrl)
    },
    branding: applied,
    customAmenities,
    site: {
      template: template.id,
      templateStyle: [templateStyle(template), brandAccentStyle(applied, template.tokens.bg)].filter(Boolean).join(';'),
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
