import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import { normaliseServerUrl } from '$lib/analytics-servers';

/** Analytics has a tab of its own. It is neither a delivery integration nor a
 *  destructive action, so it sat oddly at the bottom of Advanced and was easy to
 *  miss. */
export const load: PageServerLoad = async ({ locals }) => {
  const org = await requireOrgPermission(locals, 'settings.manage');

  const gtmRow = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'gtm'`, org.id);

  let gtmContainerId = '';
  let gtmServerUrl = '';
  try {
    const parsed = gtmRow?.value ? (typeof gtmRow.value === 'string' ? JSON.parse(gtmRow.value) : gtmRow.value) : null;
    gtmContainerId = (parsed as { containerId?: string })?.containerId ?? '';
    gtmServerUrl = (parsed as { serverUrl?: string })?.serverUrl ?? '';
  } catch { /* malformed — treat as unset */ }

  return { gtmContainerId, gtmServerUrl };
};

export const actions: Actions = {
  /** The venue's OWN GTM container on its public site, and optionally its server
   *  container (sGTM). Hallify's platform container also runs there, measuring for
   *  Hallify; the two report to separate properties. Empty id clears it. */
  saveGtm: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const raw = String(data.get('gtmContainerId') ?? '').trim().toUpperCase();
    if (raw && !/^GTM-[A-Z0-9]{4,}$/.test(raw)) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidGtmId });
    }
    const rawServer = String(data.get('gtmServerUrl') ?? '').trim();
    const serverUrl = normaliseServerUrl(rawServer);
    if (rawServer && !serverUrl) return fail(400, { error: st(locals.locale).serverErrors.invalidServerUrl });
    if (!raw) {
      await dbRun(locals.db, `DELETE FROM org_settings WHERE org_id = ? AND key = 'gtm'`, orgId);
    } else {
      await dbRun(locals.db,
        `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
        VALUES (?, 'gtm', ?, datetime('now'))`,
        orgId, toJson(serverUrl ? { containerId: raw, serverUrl } : { containerId: raw })
      );
    }
    return { gtmSuccess: true };
  },
};
