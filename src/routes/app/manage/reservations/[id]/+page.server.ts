import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// This event view was merged into the canonical event page at
// /app/reservation/[id]. Redirect any old/bookmarked links there.
export const load: PageServerLoad = ({ params }) => {
  redirect(307, `/app/reservation/${params.id}`);
};
