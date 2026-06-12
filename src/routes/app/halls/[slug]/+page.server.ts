import { error } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	// slug param could be a real slug or the hall's UUID (fallback)
	const [hall] = await sql<HallRow[]>`
		SELECT * FROM halls
		WHERE is_public = true
		  AND (slug = ${params.slug} OR id::text = ${params.slug})
		LIMIT 1
	`;

	if (!hall) error(404, 'Hall not found');

	return {
		hall,
		isLoggedIn: !!locals.user,
		isClient: locals.user?.account_type === 'client',
	};
};
