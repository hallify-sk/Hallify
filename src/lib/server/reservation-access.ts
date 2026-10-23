// Who may see and who may manage a reservation, for the event pages under
// /app/reservation/[id] (detail, layout, seating sheet, RSVP editor).
//
// These pages used to scope by organisation only and decide "staff" by
// organization_members.role, so:
//   * denying `reservations.view` to a member changed nothing — they still opened a
//     colleague's booking, the client's e-mail, the guest list and the editor;
//   * a custom role holding `reservations.manage` could approve from the list but got
//     "only staff can change the status" on the booking's own page.
// Both now follow the member's effective permissions, the same way the list does.

import { error } from '@sveltejs/kit';
import { loadMemberAccess } from '$lib/server/access';
import { ADMINISTRATOR_PERMISSIONS, effectivePermissions, type Permission } from '$lib/permissions';

export interface ReservationAccess {
	/** May open bookings that belong to someone else in the organisation. */
	canViewAll: boolean;
	/** May change status, edit details, assign clients, message clients, extras. */
	canManage: boolean;
}

/** The caller's effective permissions in the active organisation (owner: all of them). */
export async function memberPermissions(locals: App.Locals): Promise<Set<Permission>> {
	const org = locals.currentOrg;
	const user = locals.user;
	if (!org || !user) return new Set();
	const access = await loadMemberAccess(locals.db, org.id, user.id, { isOwner: org.role === 'owner' });
	// The legacy admin flag keeps meaning what it always meant (see requireOrgPermission):
	// added as a role, so a per-member deny override still wins.
	if (org.role === 'admin') {
		access.roles = [
			...access.roles,
			{ id: 'legacy-admin', name: 'Administrator', position: -1, permissions: ADMINISTRATOR_PERMISSIONS }
		];
	}
	return effectivePermissions(access);
}

export async function reservationAccess(locals: App.Locals): Promise<ReservationAccess> {
	const held = await memberPermissions(locals);
	return resolveReservationAccess(held);
}

/** Pure part, for tests: manage implies view. */
export function resolveReservationAccess(held: Set<Permission>): ReservationAccess {
	const canManage = held.has('reservations.manage');
	return { canManage, canViewAll: canManage || held.has('reservations.view') };
}

/** May this caller open this particular booking? Their own always; others' with the view permission. */
export function canOpenReservation(access: ReservationAccess, reservationUserId: string, userId: string | undefined): boolean {
	return access.canViewAll || (!!userId && reservationUserId === userId);
}

/**
 * Guard for a page load: 404 rather than 403 for a booking the caller may not see,
 * so ids of other people's bookings are not confirmed to exist.
 */
export function assertCanOpenReservation(
	access: ReservationAccess,
	reservationUserId: string,
	userId: string | undefined,
	notFoundMessage: string
): void {
	if (!canOpenReservation(access, reservationUserId, userId)) error(404, notFoundMessage);
}
