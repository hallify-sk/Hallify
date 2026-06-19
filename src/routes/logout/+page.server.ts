import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
  await deleteSession(cookies, locals.db);
  // Domain visitors go back to halls; main-domain users go to their login
  redirect(303, locals.domainOrg ? '/halls' : '/app/login');
};
