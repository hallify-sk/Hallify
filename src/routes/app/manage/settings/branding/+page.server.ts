import type { PageServerLoad, Actions } from './$types';
import sql from '$lib/db';
import { invalidateBrandingCache } from '$lib/branding-cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jsonb = (obj: unknown) => sql.json(obj as any);

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const [row] = await sql<{ value: unknown }[]>`
    SELECT value FROM org_settings WHERE org_id = ${orgId} AND key = 'branding'
  `;
  return { branding: (row?.value ?? {}) as Record<string, string> };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
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
    await sql`
      INSERT INTO org_settings (org_id, key, value, updated_at)
      VALUES (${orgId}, 'branding', ${jsonb(branding)}, NOW())
      ON CONFLICT (org_id, key) DO UPDATE SET value = ${jsonb(branding)}, updated_at = NOW()
    `;
    invalidateBrandingCache();
    return { success: true };
  },

  resetDefaults: async ({ locals }) => {
    const orgId = locals.currentOrg!.id;
    await sql`DELETE FROM org_settings WHERE org_id = ${orgId} AND key = 'branding'`;
    invalidateBrandingCache();
    return { success: true, reset: true };
  },
};
