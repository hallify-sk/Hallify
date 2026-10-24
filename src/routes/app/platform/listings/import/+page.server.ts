import { requirePlatformAdmin } from '$lib/guards';
import type { PageServerLoad } from './$types';

/** Bulk import of venues that are not on Hallify, from a .json file. The page reads
 *  the file and talks to ./preview and ./run; nothing is loaded up front. */
export const load: PageServerLoad = async ({ locals }) => {
  requirePlatformAdmin(locals);
  return {};
};
