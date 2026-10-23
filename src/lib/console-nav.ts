import { CONSOLE_PERMISSIONS, type Permission } from '$lib/permissions';

/**
 * Which console links the sidebar shows, from the member's role and effective
 * permissions (see $lib/server/nav-access).
 *
 * Each entry mirrors the guard on the page it links to, so a member sees exactly the
 * pages that would load for them. The sidebar used to show the whole console to owners
 * and admins and nothing to anyone else, so a custom role holding, say,
 * `reservations.manage` could open the reservations page by typing its URL but had no
 * link to it.
 */
export interface ConsoleNav {
	/** May enter /app/manage at all (the dashboard and help). */
	console: boolean;
	halls: boolean;
	reservations: boolean;
	/** The client list (D10), built from the reservations: the same permission. */
	clients: boolean;
	calendar: boolean;
	assistant: boolean;
	/** The client inbox, /app/manage/messages (owner/admin only on the server). */
	clientMessages: boolean;
	announcements: boolean;
	/** Where "Members" leads, or null: the first People page this member may open. */
	members: string | null;
	billing: boolean;
	settings: boolean;
}

export function consoleNav(role: string | null | undefined, permissions: Iterable<string>): ConsoleNav {
	const held = new Set(permissions);
	const has = (p: Permission) => held.has(p);
	const staff = role === 'owner' || role === 'admin';

	return {
		console: staff || CONSOLE_PERMISSIONS.some(has),
		halls: has('halls.manage'),
		reservations: has('reservations.manage'),
		clients: has('reservations.manage'),
		calendar: has('reservations.manage'),
		assistant: has('ai.use'),
		clientMessages: staff,
		announcements: staff,
		members: has('members.manage')
			? '/app/manage/members'
			: has('invites.manage')
				? '/app/manage/members/invites'
				: has('roles.manage')
					? '/app/manage/members/roles'
					: null,
		// The billing page shows to whoever runs the organisation's settings; paying and
		// changing the plan stay with the owner (billing.manage), guarded on the server.
		billing: has('billing.manage') || has('settings.manage'),
		settings: has('settings.manage')
	};
}
