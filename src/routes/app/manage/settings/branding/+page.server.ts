import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// These settings moved under /app/manage/settings as tabs. Kept as a permanent
// redirect so existing bookmarks, docs links and any emailed links still land
// somewhere useful instead of 404ing.
export const load: PageServerLoad = () => {
	redirect(308, '/app/manage/settings/customize');
};
