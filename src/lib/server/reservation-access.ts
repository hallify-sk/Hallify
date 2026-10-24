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
import { orgPermissions } from '$lib/server/access';
import type { Permission } from '$lib/permissions';

export interface ReservationAccess {
	/** May open bookings that belong to someone else in the organisation. */
	canViewAll: boolean;
	/** May change status, edit details, assign clients, message clients, extras. */
	canManage: boolean;
}

/** The caller's effective permissions in the active organisation (owner: all of them),
 *  resolved by the same `orgPermissions` every console guard uses. */
export async function memberPermissions(locals: App.Locals): Promise<Set<Permission>> {
	return orgPermissions(locals);
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

/** May this caller change this booking: cancel it, re-arrange or reset its tables, load a
 *  template? Members with `reservations.manage` any booking in the org; everyone else only
 *  their own. `reservations.view` alone opens a colleague's booking read-only (D3). */
export function canActOnReservation(access: ReservationAccess, reservationUserId: string, userId: string | undefined): boolean {
	return access.canManage || (!!userId && reservationUserId === userId);
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
