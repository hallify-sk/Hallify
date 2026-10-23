import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { hasConsoleEntry } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

/**
 * The console's outer door.
 *
 * It decides who may be here AT ALL, and nothing finer. Which pages a caller may
 * see is each page's own load to answer, because SvelteKit does not run a layout
 * load before a form action — a check here protects navigation and nothing else.
 *
 * This used to read `organization_members.role` and bounce anyone who was not an
 * owner or an admin, which quietly made the whole permission system inert for
 * navigation: a custom role granting `halls.manage` satisfied every gate on the
 * halls route and was still redirected to /app/ before that route's load ran.
 * Relaxing it was only safe once every page under /app/manage guarded its own
 * load, which they now do.
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url));
  if (locals.user.account_type === 'client') redirect(303, '/app/client');
  if (!locals.currentOrg) redirect(303, '/app/org/new');

  // A member holding no console permission at all is sent to their own area
  // rather than shown a 403: for them this is not a page that failed. A view
  // permission (reservations.view, halls.view, ...) is a way in too: it opens that
  // area's pages read-only, and nothing else.
  if (!(await hasConsoleEntry(locals))) redirect(303, '/app/');

  return { currentOrg: locals.currentOrg };
};
