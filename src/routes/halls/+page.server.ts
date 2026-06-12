import sql from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // locals.domainOrg is guaranteed non-null by the halls layout server guard
  const orgId = locals.domainOrg!.id;

  const halls = await sql<{
    id: string;
    name: string;
    description: string | null;
    max_people: number;
    color: string;
    slug: string;
    cover_image_url: string | null;
    amenities: unknown;
    address: string | null;
  }[]>`
    SELECT id, name, description, max_people, color, slug, cover_image_url, amenities, address
    FROM halls
    WHERE is_public = true AND slug IS NOT NULL AND org_id = ${orgId}
    ORDER BY name
  `;

  return { halls };
};
