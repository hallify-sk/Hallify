import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/app/login');
	if (locals.user.account_type !== 'client') redirect(303, '/app/');
	return { user: locals.user };
};
