import { error } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const orgId = locals.domainOrg!.id;

  const [hall] = await sql<HallRow[]>`
    SELECT * FROM halls
    WHERE slug = ${params.slug} AND is_public = true AND org_id = ${orgId}
  `;
  if (!hall) error(404, 'Hall not found');

  return { hall, booked: url.searchParams.get('booked') === '1' };
};
