import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson, fromJson } from '$lib/db/index';
import { invalidateBrandingCache } from '$lib/branding-cache';
import { st } from '$lib/i18n-server';
import { PLANS } from '$lib/plans';
import { requireOrgStaff } from '$lib/guards';

// Custom branding (Customize page) is a paid feature (Starter and up).
function planHasBranding(plan: string): boolean {
  return PLANS[plan as keyof typeof PLANS]?.limits.customBranding ?? false;
}

async function loadOrgLanguage(db: App.Locals['db'], orgId: string): Promise<'sk' | 'en'> {
  const row = await dbFirst<{ value: string | null }>(db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'locale'`, orgId);
  const v = (fromJson<{ default?: string }>(row?.value ?? null) ?? {}).default;
  return v === 'en' ? 'en' : 'sk';
}

export const load: PageServerLoad = async ({ locals }) => {
  const org = locals.currentOrg!;
  // Default language is available to every plan (not gated like custom branding).
  const orgLanguage = await loadOrgLanguage(locals.db, org.id);

  // Read before the plan gate: the venue's own GTM container is not a branding
  // feature, and free orgs still have a <slug>.hallify.sk bubble to measure.
  const gtmRow = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'gtm'`, org.id);
  let gtmContainerId = '';
  try {
    const parsed = gtmRow?.value ? (typeof gtmRow.value === 'string' ? JSON.parse(gtmRow.value) : gtmRow.value) : null;
    gtmContainerId = (parsed as { containerId?: string })?.containerId ?? '';
  } catch { /* malformed — treat as unset */ }

  if (!planHasBranding(org.subscription.plan)) {
    return { locked: true, plan: org.subscription.plan, branding: {} as Record<string, string>, orgLanguage, gtmContainerId };
  }
  const row = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'`,
    org.id
  );

  return {
    gtmContainerId, locked: false, plan: org.subscription.plan, branding: (fromJson<Record<string, string>>(row?.value ?? null) ?? {}) as Record<string, string>, orgLanguage };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    if (!planHasBranding(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.customBrandingPaidPlan });
    const orgId = org.id;
    const data = await request.formData();
    const themeRaw = String(data.get('theme') ?? 'slate');
    const branding = {
      appName:      String(data.get('appName')      ?? 'Hallify'),
      tagline:      String(data.get('tagline')      ?? ''),
      logoUrl:      String(data.get('logoUrl')      ?? ''),
      primaryColor: String(data.get('primaryColor') ?? '#4f6ef7'),
      accentColor:  String(data.get('accentColor')  ?? '#4f6ef7'),
      theme:        ['slate', 'dark', 'warm'].includes(themeRaw) ? themeRaw : 'slate',
    };
    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
      VALUES (?, 'branding', ?, datetime('now'))`,
      orgId, toJson(branding)
    );
    invalidateBrandingCache();
    return { success: true };
  },

  /** The venue's OWN GTM container, used only on their bubble.
   *  Hallify's container never runs on a customer domain — on a bubble the venue is
   *  the controller for its visitors' data under the DPA, so the tracking there must
   *  be theirs. Empty value clears it. */
  saveGtm: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const raw = String(data.get('gtmContainerId') ?? '').trim().toUpperCase();
    if (raw && !/^GTM-[A-Z0-9]{4,}$/.test(raw)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidGtmId });
    }
    if (!raw) {
      await dbRun(locals.db, `DELETE FROM org_settings WHERE org_id = ? AND key = 'gtm'`, orgId);
    } else {
      await dbRun(locals.db,
        `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
        VALUES (?, 'gtm', ?, datetime('now'))`,
        orgId, toJson({ containerId: raw })
      );
    }
    return { gtmSuccess: true };
  },

  // Org default language — NOT plan-gated (available to all plans).
  saveLanguage: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    const data = await request.formData();
    const langRaw = String(data.get('language') ?? 'sk');
    const language = langRaw === 'en' ? 'en' : 'sk';
    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
      VALUES (?, 'locale', ?, datetime('now'))`,
      org.id, toJson({ default: language })
    );
    return { success: true, languageSaved: language };
  },

  resetDefaults: async ({ locals }) => {
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    if (!planHasBranding(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.customBrandingPaidPlan });
    const orgId = org.id;
    await dbRun(locals.db,
      `DELETE FROM org_settings WHERE org_id = ? AND key = 'branding'`,
      orgId
    );
    invalidateBrandingCache();
    return { success: true, reset: true };
  },
};
