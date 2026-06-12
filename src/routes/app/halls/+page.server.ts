import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';

	const halls = await sql<(Pick<HallRow, 'id' | 'slug' | 'name' | 'description' | 'max_people' | 'address' | 'cover_image_url' | 'amenities' | 'color'>)[]>`
		SELECT id, slug, name, description, max_people, address, cover_image_url, amenities, color
		FROM halls
		WHERE is_public = true
		${q ? sql`AND (name ILIKE ${'%' + q + '%'} OR description ILIKE ${'%' + q + '%'} OR address ILIKE ${'%' + q + '%'})` : sql``}
		ORDER BY name
		LIMIT 60
	`;

	return { halls, q };
};
