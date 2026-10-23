import { ADMINISTRATOR_PERMISSIONS, PERMISSIONS, effectivePermissions, type Permission } from '$lib/permissions';
import { loadMemberAccess } from './access';

/**
 * The current member's effective permissions in their current organisation, for the
 * console sidebar to decide which links to show.
 *
 * It resolves access exactly as `requireOrgPermission` does, so a link appears when,
 * and only when, the page behind it would load: the owner holds everything, a legacy
 * `role = 'admin'` member holds the Administrator set on top of their roles (a deny
 * override still wins), and everyone else holds what their roles and overrides give.
 *
 * Display only. Every page and action still guards itself on the server.
 */
export async function orgPermissionList(locals: App.Locals): Promise<Permission[]> {
	const org = locals.currentOrg;
	const user = locals.user;
	if (!org || !user || user.account_type === 'client') return [];
	if (org.role === 'owner') return [...PERMISSIONS];

	const access = await loadMemberAccess(locals.db, org.id, user.id, { isOwner: false });
	if (org.role === 'admin') {
		access.roles = [
			...access.roles,
			{ id: 'legacy-admin', name: 'Administrator', position: -1, permissions: ADMINISTRATOR_PERMISSIONS }
		];
	}
	return [...effectivePermissions(access)];
}
