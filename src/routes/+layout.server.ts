import { checkPermission } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Permission, User } from '$lib/server/schema';

export const load: LayoutServerLoad = async ({ locals, request, depends }) => {
	depends('/');

	const currentRoute = new URL(request.url).pathname;

	const canAccess = await checkPermission(locals.permission, currentRoute);

	if (!canAccess) {
		throw error(403, 'You do not have permission to access this page');
	}

	return {
		user: JSON.parse(JSON.stringify(locals.user)) as User,
		permission: JSON.parse(JSON.stringify(locals.permission)) as Permission
	};
};
