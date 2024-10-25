import {
	checkPermission,
	deleteSessionTokenCookie,
	setSessionTokenCookie,
	validateSessionToken
} from '$lib/server/auth';
import { Permission } from '$lib/server/models';
import { error, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('session') ?? null;

	if (token === null) {
		const permission = await Permission.findByPk(`1`);
		if(!permission) {
			throw new Error("Permission table is missing default permission (ID = 1).");
		}
		event.locals.user = null;
		event.locals.session = null;
		event.locals.permission = permission;
		const canAccess = await checkPermission(permission, event.route.id ?? '/');

		let response = await resolve(event);

		if (!canAccess) {
			response = error(401, "Pre prístup na túto stránku musíte byť prihlásený.");
		}
		return response;
	}

	const { session, user } = await validateSessionToken(token);
	if (session !== null) {
		setSessionTokenCookie(event.cookies, token, session.expires_at);
	} else {
		deleteSessionTokenCookie(event.cookies);
	}

	const permission = user ? await Permission.findByPk(`${user.permission_id}`) : await Permission.findByPk(`1`);

	if(!permission) {
		throw new Error("Permission table is missing default permission (ID = 1).");
	}

	event.locals.session = session;
	event.locals.user = user;
	event.locals.permission = permission;

	const canAccess = await checkPermission(permission, event.route.id ?? '/');

	let response = await resolve(event);

	if (!canAccess) {
		response = error(403, "Nemáte dostatočné oprávnenia na prístup na túto stránku.");
	}
	return response;
};
