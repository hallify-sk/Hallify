import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/auth';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		await deleteSession(cookies, locals.db);
		redirect(303, '/app/login');
	}
};
