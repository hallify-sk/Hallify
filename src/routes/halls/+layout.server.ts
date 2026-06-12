import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // /halls/* is only for custom-domain visitors. Redirect Hallify.app users to their dashboard.
  if (!locals.domainOrg) {
    redirect(303, '/app/halls');
  }

  return { domainOrg: locals.domainOrg };
};
