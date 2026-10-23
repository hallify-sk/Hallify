import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	if (locals.user.account_type !== 'client') redirect(303, '/app/');
	return { user: locals.user };
};
