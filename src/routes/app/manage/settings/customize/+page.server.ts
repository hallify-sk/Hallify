import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson, fromJson } from '$lib/db/index';
import { invalidateBrandingCache } from '$lib/branding-cache';
import { st } from '$lib/i18n-server';
import { PLANS } from '$lib/plans';
import { requireOrgOwner } from '$lib/guards';
import { requireOrgPermission } from '$lib/server/access';

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
  await requireOrgPermission(locals, 'settings.manage');
  const org = locals.currentOrg!;
  // Default language is available to every plan (not gated like custom branding).
  const orgLanguage = await loadOrgLanguage(locals.db, org.id);

  if (!planHasBranding(org.subscription.plan)) {
    return { locked: true, plan: org.subscription.plan, branding: {} as Record<string, string>, orgLanguage, orgName: org.name };
  }
  const row = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'`,
    org.id
  );

  return {
    locked: false, plan: org.subscription.plan, branding: (fromJson<Record<string, string>>(row?.value ?? null) ?? {}) as Record<string, string>, orgLanguage, orgName: org.name };
};

export const actions: Actions = {
  // The organization's own name — distinct from the public `appName` in branding,
  // and deliberately NOT plan-gated: renaming what you call yourself should not
  // require a subscription. Owner-only, which also covers a platform admin viewing
  // the org (loadOrgContext gives them role 'owner'), so an admin can rename any
  // organization from inside it.
  renameOrg: async ({ request, locals }) => {
    const org = requireOrgOwner(locals);
    const data = await request.formData();
    const name = String(data.get('orgName') ?? '').replace(/\s+/g, ' ').trim();
    if (!name) return fail(400, { renameError: st(locals.locale).serverErrors.orgNameRequired });
    if (name.length > 80) return fail(400, { renameError: st(locals.locale).serverErrors.orgNameTooLong(80) });

    // Scope to the active org: being an owner somewhere is not permission to
    // rename an arbitrary id (see the note at the top of $lib/guards).
    await dbRun(locals.db, 'UPDATE organizations SET name = ? WHERE id = ?', name, org.id);
    invalidateBrandingCache();
    return { renamed: true };
  },

  save: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasBranding(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.customBrandingPaidPlan });
    const orgId = org.id;
    const data = await request.formData();
    const themeRaw = String(data.get('theme') ?? 'slate');
    // The colour ends up in a style attribute on every page and the logo in an
    // <img src>: accept a hex colour and an uploaded or http(s) image only.
    const hex = (v: FormDataEntryValue | null) => {
      const s = String(v ?? '').trim();
      return /^#[0-9a-f]{6}$/i.test(s) ? s : '#f05ca1';
    };
    const logoRaw = String(data.get('logoUrl') ?? '').trim();
    const logoUrl = logoRaw.startsWith('/uploads/') || /^https:\/\//i.test(logoRaw) ? logoRaw : '';
    const branding = {
      appName:      String(data.get('appName') ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Hallify',
      tagline:      String(data.get('tagline') ?? '').slice(0, 140),
      logoUrl,
      primaryColor: hex(data.get('primaryColor')),
      accentColor:  hex(data.get('accentColor')),
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

  // Org default language — NOT plan-gated (available to all plans).
  saveLanguage: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
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
    await requireOrgPermission(locals, 'settings.manage');
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
