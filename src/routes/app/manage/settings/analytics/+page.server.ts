import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { requireOrgStaff } from '$lib/guards';

/** Analytics has a tab of its own. It is neither a delivery integration nor a
 *  destructive action, so it sat oddly at the bottom of Advanced and was easy to
 *  miss. */
export const load: PageServerLoad = async ({ locals }) => {
  const org = requireOrgStaff(locals);

  const gtmRow = await dbFirst<{ value: string | null }>(locals.db,
    `SELECT value FROM org_settings WHERE org_id = ? AND key = 'gtm'`, org.id);

  let gtmContainerId = '';
  try {
    const parsed = gtmRow?.value ? (typeof gtmRow.value === 'string' ? JSON.parse(gtmRow.value) : gtmRow.value) : null;
    gtmContainerId = (parsed as { containerId?: string })?.containerId ?? '';
  } catch { /* malformed — treat as unset */ }

  return { gtmContainerId };
};

export const actions: Actions = {
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
};
