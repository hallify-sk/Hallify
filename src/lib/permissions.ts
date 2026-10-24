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
 *
 * View permissions open their own read-only pages instead (see AREA_OPENERS and
 * `consoleEntryPermissions`); they never open the dashboard, which is the console's
 * home for the people who run the venue. `announcements.manage` is not here either:
 * what it promises (posting to the organisation's announcement channels) lives in
 * the team chat, outside the console, so on its own it opened nothing but the
 * dashboard.
 */
export const CONSOLE_PERMISSIONS: Permission[] = [
	'reservations.manage',
	'halls.manage',
	'floorplans.manage',
	'templates.manage',
	'ai.use',
	'members.manage',
	'roles.manage',
	'invites.manage',
	'settings.manage',
	'billing.manage'
];

/**
 * The permissions that open each area, view or manage (D3). Every page load in the
 * area asks for ANY of its list; every action asks for the one manage permission it
 * needs. Navigation reads the same lists, so a link shows when, and only when, the
 * page behind it opens.
 *
 *  * halls: the hall pages are where a floor plan and the event templates live, so
 *    whoever may edit those may open the hall they belong to. Their editors' back
 *    links led to a 403 before.
 *  * calendar: `calendar.view` shows occupancy; managing reservations has always
 *    included the calendar.
 *  * messages: the client inbox and the team channels both open on `messages.view`.
 */
export const AREA_OPENERS = {
	reservations: ['reservations.view', 'reservations.manage'],
	calendar: ['calendar.view', 'reservations.manage'],
	halls: ['halls.view', 'halls.manage', 'floorplans.manage', 'templates.manage'],
	members: ['members.view', 'members.manage'],
	messages: ['messages.view']
} as const satisfies Record<string, readonly Permission[]>;

export type ConsoleArea = keyof typeof AREA_OPENERS;

/** Everything that lets a member through the /app/manage door: a manage permission
 *  (the dashboard and their pages) or a permission that opens a read-only page. */
export function consoleEntryPermissions(): Permission[] {
	const out = new Set<Permission>(CONSOLE_PERMISSIONS);
	for (const list of Object.values(AREA_OPENERS)) for (const p of list) out.add(p);
	return [...out];
}

/**
 * What a member may do in each area, from their effective permission set. The
 * permission matrix in one place: page loads, actions and the sidebar all read it.
 */
export interface AreaAccess {
	reservations: { view: boolean; manage: boolean };
	calendar: { view: boolean; openReservations: boolean; create: boolean };
	/** `tableTypes`: the hall's table inventory, which the templates are laid out
	 *  from, so templates.manage edits it too (as its description says). */
	halls: { view: boolean; manage: boolean; floorplans: boolean; templates: boolean; tableTypes: boolean };
	members: { view: boolean; manage: boolean };
	messages: { view: boolean; send: boolean };
	/** Post in the organisation's announcement channels and create new ones. */
	announcements: { post: boolean };
}

export function areaAccess(permissions: Iterable<string>): AreaAccess {
	const held = new Set<string>(permissions);
	const has = (p: Permission) => held.has(p);
	const opens = (area: ConsoleArea) => AREA_OPENERS[area].some((p) => held.has(p));
	const reservationsView = opens('reservations');
	return {
		reservations: { view: reservationsView, manage: has('reservations.manage') },
		calendar: { view: opens('calendar'), openReservations: reservationsView, create: has('reservations.manage') },
		halls: {
			view: opens('halls'),
			manage: has('halls.manage'),
			floorplans: has('floorplans.manage'),
			templates: has('templates.manage'),
			tableTypes: has('halls.manage') || has('templates.manage')
		},
		members: { view: opens('members'), manage: has('members.manage') },
		// Sending without reading would be posting blind into threads one cannot open.
		messages: { view: has('messages.view'), send: has('messages.view') && has('messages.send') },
		announcements: { post: has('announcements.manage') }
	};
}

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
 * The legacy `organization_members.role = 'admin'` flag, read as a role.
 *
 * Every place that evaluates a member's access must apply it the same way: the
 * guards, the People pages' own panels and the actions' rank checks. When only the
 * guards applied it, an admin with no role ticked was let into the People area and
 * then shown read-only controls, and the owner's panel listed 6 permissions for
 * somebody the guards gave 16. It is added as a ROLE rather than as a bypass, so a
 * per-member deny still wins over it.
 *
 * Position -1 is the "below every real role" floor from `rankOf`: the flag grants
 * permissions, it must not hand anybody seniority over a real role. An admin's rank
 * comes from the Administrator role row that promoting or inviting someone as an
 * admin attaches (see `findAdministratorRole` in $lib/server/people).
 */
export const LEGACY_ADMIN_ROLE_ID = 'legacy-admin';

/** Two roles called the same are two chips nobody can tell apart on the Members tab
 *  or in the invite form, so a role name is unique within an org, ignoring case and
 *  surrounding spaces. */
export function sameRoleName(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function withLegacyAdmin(access: MemberAccess, legacyRole: string | null | undefined): MemberAccess {
	if (access.isOwner || legacyRole !== 'admin') return access;
	if (access.roles.some((r) => r.id === LEGACY_ADMIN_ROLE_ID)) return access;
	return {
		...access,
		roles: [
			...access.roles,
			{ id: LEGACY_ADMIN_ROLE_ID, name: 'Administrator', position: -1, permissions: ADMINISTRATOR_PERMISSIONS }
		]
	};
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

/**
 * Whether `actor` may make somebody a legacy admin, by inviting them as one or by
 * switching their access level to it.
 *
 * The flag carries every permission in ADMINISTRATOR_PERMISSIONS (see
 * `withLegacyAdmin`), so handing it out is granting that whole set. Without this an
 * admin whose `settings.manage` had been denied could invite a second account as an
 * admin and walk straight back into settings through it.
 *
 * `administratorPosition` is the position of the Administrator role row that making
 * somebody an admin attaches (`administratorRoleToAttach` in $lib/server/people), or
 * null/undefined when none would be attached.
 */
export function canGrantAdminAccess(actor: MemberAccess, administratorPosition?: number | null): boolean {
	if (actor.isOwner) return true;
	const grantable = grantablePermissions(actor);
	if (!ADMINISTRATOR_PERMISSIONS.every((p) => grantable.has(p))) return false;
	// Becoming an admin also attaches the Administrator role row (and its rank), so
	// it is assigning that role: the same strictly-below rule as `canManageRole`.
	// Without it, a custom role ranked under Administrator but holding all of its
	// permissions through overrides could mint an admin who then outranks them.
	if (administratorPosition != null && rankOf(actor) <= administratorPosition) return false;
	return true;
}
