import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Settings has no page of its own — it opens on its first tab. */
export const load: PageServerLoad = () => {
  redirect(307, '/app/manage/settings/domains');
};
