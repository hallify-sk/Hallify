import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Domains moved under /app/manage/settings as a tab. Kept as a permanent redirect
// so existing bookmarks and links still resolve.
export const load: PageServerLoad = () => {
	redirect(308, '/app/manage/settings/domains');
};
