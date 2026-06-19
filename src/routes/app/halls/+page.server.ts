import { dbAll } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { fromJsonArr } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';

	let query = `SELECT id, slug, name, description, max_people, address, cover_image_url, amenities, color
		FROM halls
		WHERE is_public = 1`;
	const params: unknown[] = [];

	if (q) {
		query += ` AND (name LIKE ? OR description LIKE ? OR address LIKE ?)`;
		const like = '%' + q + '%';
		params.push(like, like, like);
	}

	query += ` ORDER BY name LIMIT 60`;

	const halls = await dbAll<Pick<HallRow, 'id' | 'slug' | 'name' | 'description' | 'max_people' | 'address' | 'cover_image_url' | 'amenities' | 'color'>>(
		locals.db,
		query,
		...params
	);

	return { halls: halls.map(h => ({ ...h, amenities: fromJsonArr(h.amenities as string | null) })), q };
};
