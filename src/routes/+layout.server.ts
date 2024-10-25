import { checkPermission } from '$lib/server/auth';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { UserSanitized } from '$lib/types/auth';
import type { Permission } from '$lib/server/models';

export const load: LayoutServerLoad = async ({locals, request, depends}) => {

    depends("/");

    console.log("RAN LOAD FUNCTION");

    const currentRoute = new URL(request.url).pathname;

    const canAccess = await checkPermission(locals.permission, currentRoute);

    if (!canAccess) {
        throw error(403, "You do not have permission to access this page");
    };

    const user: UserSanitized | null = locals.user ? {
        id: locals.user.id,
        email: locals.user.email,
        first_name: locals.user.first_name,
        last_name: locals.user.last_name,
        created_at: locals.user.created_at,
        updated_at: locals.user.updated_at

    } : null;

    return {
        user,
        permission: JSON.parse(JSON.stringify(locals.permission)) as Permission
    };
}