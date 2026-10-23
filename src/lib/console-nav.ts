import { CONSOLE_PERMISSIONS, areaAccess, type Permission } from '$lib/permissions';

/**
 * Which console links the sidebar shows, from the member's role and effective
 * permissions (see $lib/server/nav-access).
 *
 * Each entry mirrors the guard on the page it links to, so a member sees exactly the
 * pages that would load for them. The sidebar used to show the whole console to owners
 * and admins and nothing to anyone else, so a custom role holding, say,
 * `reservations.manage` could open the reservations page by typing its URL but had no
 * link to it. View permissions open their area's pages read-only (D3), so they bring
 * their own links too, without the dashboard.
 */
export interface ConsoleNav {
	/** The dashboard and help: a manage permission (see CONSOLE_PERMISSIONS). */
	console: boolean;
	/** Whether the console's section shows at all (any of its links). */
	section: boolean;
	halls: boolean;
	reservations: boolean;
	calendar: boolean;
	assistant: boolean;
	/** The client inbox, /app/manage/messages (messages.view). */
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
	const access = areaAccess(held);

	const dashboard = staff || CONSOLE_PERMISSIONS.some(has);
	const halls = access.halls.view;
	const reservations = access.reservations.view;
	const calendar = access.calendar.view;
	const assistant = has('ai.use');
	const clientMessages = access.messages.view;

	return {
		console: dashboard,
		section: dashboard || halls || reservations || calendar || assistant || clientMessages,
		halls,
		reservations,
		calendar,
		assistant,
		clientMessages,
		announcements: staff,
		members: access.members.view
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
