import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { requireOrgStaff } from '$lib/guards';
import { PLANS, type PlanId } from '$lib/plans';
import { SITE_TEMPLATES, DEFAULT_TEMPLATE, resolveTemplate } from '$lib/site-templates';

/**
 * The look of the organisation's own public site (its subdomain or custom domain).
 *
 * Separate from Customize, which is the logo and colours used inside the app. This
 * tab decides what a visitor to the venue's own site sees, which is a different
 * audience and a different decision.
 */
function planAllowsTemplates(plan: string, status: string | null | undefined): boolean {
  // A lapsed subscription is not a paid one: without the status check an org could
  // cancel and keep a premium template running on a live public site indefinitely.
  const paid = PLANS[plan as PlanId]?.limits.customBranding ?? false;
  return paid && (status === 'active' || status === 'trialing');
}

export const load: PageServerLoad = async ({ locals }) => {
  const org = requireOrgStaff(locals);

  const row = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'site'`, org.id);
  const site = fromJson<{ template?: string; tagline?: string; intro?: string }>(row?.value ?? null) ?? {};

  const allowPremium = planAllowsTemplates(org.subscription.plan, org.subscription.status);

  return {
    // What is STORED, so the picker shows their real choice even when the plan has
    // lapsed and the live site has fallen back to the default.
    selected: site.template ?? DEFAULT_TEMPLATE,
    // What a visitor is actually being served right now.
    effective: resolveTemplate(site.template, allowPremium).id,
    tagline: site.tagline ?? '',
    intro: site.intro ?? '',
    allowPremium,
    plan: org.subscription.plan,
    templates: SITE_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      premium: t.premium,
      swatch: {
        bg: t.tokens.bg,
        surface: t.tokens.surface,
        ink: t.tokens.ink,
        accent: t.tokens.accent,
        line: t.tokens.line,
        radius: t.tokens.radius
      }
    }))
  };
};

const VALID = new Set(SITE_TEMPLATES.map((t) => t.id));
const PREMIUM = new Set(SITE_TEMPLATES.filter((t) => t.premium).map((t) => t.id));

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const org = requireOrgStaff(locals);
    const data = await request.formData();

    const template = String(data.get('template') ?? '');
    if (!VALID.has(template as never)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidTemplate });
    }

    // The picker disables premium cards, but a disabled control is not a check —
    // the form can be submitted with any value.
    const allowPremium = planAllowsTemplates(org.subscription.plan, org.subscription.status);
    if (PREMIUM.has(template as never) && !allowPremium) {
      return fail(403, { error: st(locals.locale).serverErrors.templatePaidPlan });
    }

    // Free text shown on a public page: cap it, and never store markup.
    const strip = (v: unknown, max: number) =>
      String(v ?? '').replace(/[<>]/g, '').replace(/\s+\n/g, '\n').trim().slice(0, max);

    const tagline = strip(data.get('tagline'), 140);
    const intro = strip(data.get('intro'), 600);

    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
       VALUES (?, 'site', ?, datetime('now'))`,
      org.id, toJson({ template, tagline, intro }));

    return { saved: true };
  }
};
