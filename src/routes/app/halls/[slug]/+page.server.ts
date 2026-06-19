import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { fromJsonArr, fromJson } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// slug param could be a real slug or the hall's UUID (fallback)
	const hall = await dbFirst<HallRow>(
		locals.db,
		`SELECT * FROM halls
		WHERE is_public = 1
		  AND (slug = ? OR id = ?)
		LIMIT 1`,
		params.slug,
		params.slug
	);

	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

	return {
		hall: {
			...hall,
			gallery_images: fromJsonArr(hall.gallery_images as string | null),
			amenities: fromJsonArr(hall.amenities as string | null),
			opening_hours: fromJson(hall.opening_hours as string | null),
		},
		isLoggedIn: !!locals.user,
		isClient: locals.user?.account_type === 'client',
	};
};
