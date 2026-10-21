/**
 * Organisation permissions.
 *
 * Shaped after Discord: named roles carry permissions, a member can hold several,
 * and a per-member override can add or remove individual permissions on top. Roles
 * are ORDERED — `position` decides seniority, and you may only act on roles and
 * members ranked below your own.
 *
 * Two deliberate choices:
 *
 *  * Permissions are stored as a JSON array of string keys, not a bitfield.
 *    JavaScript's bitwise operators are 32-bit, so `1 << 31` goes negative and a
 *    bitfield silently breaks at the 32nd permission — a trap that surfaces years
 *    later as a security bug. Keys also mean a stored row is readable in a SQL
 *    client, which matters when debugging who could do what.
 *
 *  * The owner is not a role. Exactly one person owns an organisation, they bypass
 *    every check, and no permission can be taken from them. Modelling that as a
 *    role invites someone to edit it until the organisation has nobody who can
 *    pay the bill or close the account.
 */

/** Every permission the application understands. */
export const PERMISSIONS = [
	// ── Operations ───────────────────────────────────────────────────────────
	'reservations.view',
	'reservations.manage',
	'halls.view',
	'halls.manage',
	'floorplans.manage',
	'templates.manage',
	'calendar.view',
	// Spends the organisation's AI credits. Every tool the assistant runs is still
	// checked against the member's own permissions; this only lets them ask.
	'ai.use',

	// ── Communication ────────────────────────────────────────────────────────
	'messages.view',
	'messages.send',
	'announcements.manage',

	// ── Organisation ─────────────────────────────────────────────────────────
	'members.view',
	'members.manage',
	'roles.manage',
	'invites.manage',
	'settings.manage',
	'billing.manage'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * What the built-in "Administrator" role carries, and what the legacy
 * `organization_members.role = 'admin'` flag has always implied: everything except
 * `billing.manage`, which stays with the owner.
 *
 * It lives here, next to the catalogue, because three places have to agree on it —
 * migration 0007's seed, `seedBuiltInRoles` for organisations created after it, and
 * the legacy-admin fallback in `$lib/server/access`. A copy that drifts in any one of
 * them is an access bug nobody notices until an admin is refused.
 */
export const ADMINISTRATOR_PERMISSIONS: Permission[] = PERMISSIONS.filter(
	(p) => p !== 'billing.manage'
);

/**
 * What the built-in default role grants — the floor of what any member can do.
 *
 * Here beside the catalogue for the same reason ADMINISTRATOR_PERMISSIONS is:
 * migration 0007's seed and `seedBuiltInRoles` both have to agree with it, and a
 * copy that drifts is an access bug nobody notices.
 */
export const DEFAULT_ROLE_PERMISSIONS: Permission[] = [
	'reservations.view',
	'halls.view',
	'calendar.view',
	'messages.view',
	'messages.send',
	'members.view'
];

/**
 * Permissions that open at least one page of the management console.
 *
 * Used by the /app/manage layout to decide who may be in the console at all —
 * which pages they then see is each page's own load to answer.
 *
 * Every entry is a MANAGE permission, never a view one, and that is the whole
 * point: the default Member role holds `reservations.view`, `halls.view`,
 * `calendar.view`, `messages.view` and `members.view`, so admitting a single view
 * permission here would hand the operator console to every ordinary member of
 * every organisation on the platform. The test next to this file holds that line.
 */
export const CONSOLE_PERMISSIONS: Permission[] = [
	'reservations.manage',
	'halls.manage',
	'floorplans.manage',
	'templates.manage',
	'ai.use',
	'announcements.manage',
	'members.manage',
	'roles.manage',
	'invites.manage',
	'settings.manage',
	'billing.manage'
];

/** Grouping drives the tabbed role editor; it has no effect on evaluation. */
export const PERMISSION_GROUPS: { key: string; permissions: Permission[] }[] = [
	{
		key: 'operations',
		permissions: [
			'reservations.view',
			'reservations.manage',
			'halls.view',
			'halls.manage',
			'floorplans.manage',
			'templates.manage',
			'calendar.view',
			'ai.use'
		]
	},
	{
		key: 'communication',
		permissions: ['messages.view', 'messages.send', 'announcements.manage']
	},
	{
		key: 'organization',
		permissions: ['members.view', 'members.manage', 'roles.manage', 'invites.manage', 'settings.manage', 'billing.manage']
	}
];

/**
 * Permissions that let their holder widen their own access. Granting one is
 * effectively granting everything underneath it, so the UI warns on them and the
 * server refuses to let a role grant a permission its editor does not already hold.
 */
export const ELEVATED: Permission[] = ['roles.manage', 'members.manage', 'invites.manage', 'billing.manage'];

const VALID = new Set<string>(PERMISSIONS);

/** Keep only keys this build understands. A permission removed in a later release
 *  must not keep granting access because it is still sitting in an old row. */
export function sanitize(keys: readonly string[]): Permission[] {
	const out: Permission[] = [];
	for (const k of keys) if (VALID.has(k) && !out.includes(k as Permission)) out.push(k as Permission);
	return out;
}

/** Parse a stored JSON permission array, tolerating null and malformed rows. */
export function parsePermissions(raw: string | null | undefined): Permission[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? sanitize(parsed.filter((v): v is string => typeof v === 'string')) : [];
	} catch {
		return [];
	}
}

export interface MemberRole {
	id: string;
	name: string;
	position: number;
	permissions: Permission[];
}

export interface MemberAccess {
	/** The organisation owner bypasses every check. */
	isOwner: boolean;
	roles: MemberRole[];
	/** Per-member additions on top of the roles. */
	allow?: Permission[];
	/** Per-member removals, applied last so they beat both roles and allow. */
	deny?: Permission[];
}

/**
 * The effective permission set: the union of every role, plus per-member allow,
 * minus per-member deny.
 *
 * Deny wins over allow. A denial is the only way to carve an exception out of a
 * role someone must keep for other reasons, so it has to be the final word —
 * otherwise adding a role silently re-grants something an admin explicitly removed.
 */
export function effectivePermissions(access: MemberAccess): Set<Permission> {
	if (access.isOwner) return new Set(PERMISSIONS);
	const out = new Set<Permission>();
	for (const role of access.roles) for (const p of role.permissions) out.add(p);
	for (const p of access.allow ?? []) out.add(p);
	for (const p of access.deny ?? []) out.delete(p);
	return out;
}

export function can(access: MemberAccess, permission: Permission): boolean {
	if (access.isOwner) return true;
	return effectivePermissions(access).has(permission);
}

/**
 * Seniority: the highest position among a member's roles.
 *
 * The owner outranks everyone. Somebody with no roles sits below every real role,
 * hence -1 rather than 0 — position 0 is a legitimate rank for the default role.
 */
export const OWNER_RANK = Number.POSITIVE_INFINITY;

export function rankOf(access: MemberAccess): number {
	if (access.isOwner) return OWNER_RANK;
	let rank = -1;
	for (const role of access.roles) if (role.position > rank) rank = role.position;
	return rank;
}

/**
 * Whether `actor` may edit, assign or delete a role at `targetPosition`.
 *
 * Strictly below, not below-or-equal: two people sharing a role must not be able to
 * edit it out from under each other, and nobody should be able to escalate by
 * editing the very role granting them the power to do so.
 */
export function canManageRole(actor: MemberAccess, targetPosition: number): boolean {
	if (actor.isOwner) return true;
	if (!can(actor, 'roles.manage')) return false;
	return rankOf(actor) > targetPosition;
}

/** Whether `actor` may act on `target` (assign roles, set overrides, remove them). */
export function canManageMember(actor: MemberAccess, target: MemberAccess): boolean {
	if (target.isOwner) return false; // nobody outranks the owner, including the owner
	if (actor.isOwner) return true;
	if (!can(actor, 'members.manage')) return false;
	return rankOf(actor) > rankOf(target);
}

/**
 * Permissions `actor` is allowed to put on a role.
 *
 * You cannot grant what you do not hold. Without this, anyone with `roles.manage`
 * could mint a role with `billing.manage`, assign it to themselves, and have
 * escalated past their own ceiling in two clicks.
 */
export function grantablePermissions(actor: MemberAccess): Set<Permission> {
	if (actor.isOwner) return new Set(PERMISSIONS);
	return effectivePermissions(actor);
}
