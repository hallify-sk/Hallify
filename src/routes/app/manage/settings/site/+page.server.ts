import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import { PLANS, type PlanId } from '$lib/plans';
import { SITE_TEMPLATES, DEFAULT_TEMPLATE, resolveTemplate } from '$lib/site-templates';
import { SECTION_DEFINITIONS, resolveSections } from '$lib/site-sections';

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
  const org = await requireOrgPermission(locals, 'settings.manage');

  // What the org actually has to put on a page. The builder uses it to mark a
  // section that is switched on but would render nothing, so an operator is not
  // left wondering why Contact never appears on their live site.
  const [row, counts] = await Promise.all([
    dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'site'`, org.id),
    dbFirst<{ halls: number; contacts: number }>(locals.db,
      `SELECT COUNT(*) AS halls,
              SUM(CASE WHEN contact_phone IS NOT NULL OR contact_email IS NOT NULL
                         OR contact_website IS NOT NULL OR address IS NOT NULL
                       THEN 1 ELSE 0 END) AS contacts
         FROM halls
        WHERE is_public = 1 AND slug IS NOT NULL AND org_id = ?`, org.id)
  ]);

  const site = fromJson<{
    template?: string; tagline?: string; intro?: string; sections?: unknown;
  }>(row?.value ?? null) ?? {};

  const allowPremium = planAllowsTemplates(org.subscription.plan, org.subscription.status);

  return {
    // What is STORED, so the picker shows their real choice even when the plan has
    // lapsed and the live site has fallen back to the default.
    selected: site.template ?? DEFAULT_TEMPLATE,
    // What a visitor is actually being served right now.
    effective: resolveTemplate(site.template, allowPremium).id,
    tagline: site.tagline ?? '',
    intro: site.intro ?? '',
    // Reconciled against this build's catalogue, so the builder lists exactly the
    // sections that exist — including any added since the org last saved.
    sections: resolveSections(site.sections),
    sectionCatalogue: SECTION_DEFINITIONS.map((d) => ({
      type: d.type,
      label: d.label,
      description: d.description
    })),
    hallCount: counts?.halls ?? 0,
    hasContact: (counts?.contacts ?? 0) > 0,
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
    const org = await requireOrgPermission(locals, 'settings.manage');
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

    // Texts and arrangement are part of the paid site. On a plan without them the
    // inputs are disabled, and a disabled input is not submitted: saving used to
    // store '' and wipe what the owner had written while they were on a paid plan.
    // Keep what is stored, so it is all back when they upgrade.
    const storedRow = allowPremium ? null : await dbFirst<{ value: string | null }>(locals.db,
      `SELECT value FROM org_settings WHERE org_id = ? AND key = 'site'`, org.id);
    const stored = fromJson<{ tagline?: string; intro?: string; sections?: unknown }>(storedRow?.value ?? null) ?? {};

    const tagline = allowPremium ? strip(data.get('tagline'), 140) : (stored.tagline ?? '');
    const intro = allowPremium ? strip(data.get('intro'), 600) : (stored.intro ?? '');

    // The arrangement travels as JSON in one hidden field: it is an ordered list,
    // and ordinary form encoding has no faithful way to carry one. It is parsed
    // defensively and run through resolveSections, which drops unknown types and
    // collapses duplicates — the field is client-supplied like any other.
    let sections;
    if (!allowPremium) {
      sections = resolveSections(stored.sections);
    } else {
      try {
        sections = resolveSections(JSON.parse(String(data.get('sections') ?? 'null')));
      } catch {
        sections = resolveSections(null);
      }
    }

    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
       VALUES (?, 'site', ?, datetime('now'))`,
      org.id, toJson({ template, tagline, intro, sections }));

    return { saved: true };
  }
};
