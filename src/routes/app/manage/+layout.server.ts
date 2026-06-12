import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  if (locals.user.account_type === 'client') redirect(303, '/app/client');
  if (!locals.currentOrg) redirect(303, '/app/org/new');
  if (locals.currentOrg.role !== 'owner' && locals.currentOrg.role !== 'admin') {
    redirect(303, '/app/');
  }
  return { currentOrg: locals.currentOrg };
};
