import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { canManageSettings } from '$lib/server/settings-access';

/** Settings has no page of its own — it opens on its first tab. A member who may not
 *  manage settings opens on Advanced, the one tab with something for them (leaving). */
export const load: PageServerLoad = async ({ locals }) => {
  redirect(307, (await canManageSettings(locals)) ? '/app/manage/settings/domains' : '/app/manage/settings/advanced');
};
