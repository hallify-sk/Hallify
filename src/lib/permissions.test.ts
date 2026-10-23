import { describe, expect, it } from 'vitest';
import {
	ADMINISTRATOR_PERMISSIONS,
	CONSOLE_PERMISSIONS,
	DEFAULT_ROLE_PERMISSIONS,
	LEGACY_ADMIN_ROLE_ID,
	PERMISSIONS,
	can,
	canGrantAdminAccess,
	canManageMember,
	canManageRole,
	effectivePermissions,
	grantablePermissions,
	parsePermissions,
	rankOf,
	sameRoleName,
	sanitize,
	type MemberAccess,
	type MemberRole,
	type Permission,
	withLegacyAdmin
} from './permissions';

const role = (name: string, position: number, permissions: Permission[]): MemberRole => ({
	id: name,
	name,
	position,
	permissions
});

const member = (roles: MemberRole[], extra: Partial<MemberAccess> = {}): MemberAccess => ({
	isOwner: false,
	roles,
	...extra
});

const OWNER: MemberAccess = { isOwner: true, roles: [] };

describe('effective permissions', () => {
	it('unions every role the member holds', () => {
		const m = member([
			role('staff', 0, ['reservations.view']),
			role('comms', 1, ['messages.send'])
		]);
		expect([...effectivePermissions(m)].sort()).toEqual(['messages.send', 'reservations.view']);
	});

	it('adds per-member allow on top of roles', () => {
		const m = member([role('staff', 0, ['reservations.view'])], { allow: ['billing.manage'] });
		expect(can(m, 'billing.manage')).toBe(true);
	});

	it('lets deny beat both roles and allow', () => {
		// Deny is the only way to carve an exception out of a role somebody must keep,
		// so adding a role must never silently restore what was explicitly removed.
		const m = member([role('admin', 0, ['billing.manage'])], {
			allow: ['billing.manage'],
			deny: ['billing.manage']
		});
		expect(can(m, 'billing.manage')).toBe(false);
	});

	it('gives the owner everything, with no roles at all', () => {
		expect(effectivePermissions(OWNER).size).toBe(PERMISSIONS.length);
		for (const p of PERMISSIONS) expect(can(OWNER, p)).toBe(true);
	});

	it('cannot strip a permission from the owner', () => {
		const stripped: MemberAccess = { isOwner: true, roles: [], deny: ['billing.manage'] };
		expect(can(stripped, 'billing.manage')).toBe(true);
	});
});

describe('stored values', () => {
	it('drops keys this build does not understand', () => {
		// A permission removed in a later release must not keep granting access
		// because an old row still lists it.
		expect(sanitize(['reservations.view', 'legacy.superuser'])).toEqual(['reservations.view']);
	});

	it('de-duplicates', () => {
		expect(sanitize(['halls.manage', 'halls.manage'])).toEqual(['halls.manage']);
	});

	it('survives null and malformed rows', () => {
		expect(parsePermissions(null)).toEqual([]);
		expect(parsePermissions('not json')).toEqual([]);
		expect(parsePermissions('{"a":1}')).toEqual([]);
		expect(parsePermissions('["halls.manage",7,null]')).toEqual(['halls.manage']);
	});
});

describe('seniority', () => {
	it('ranks a member by their highest role', () => {
		expect(rankOf(member([role('a', 2, []), role('b', 5, [])]))).toBe(5);
	});

	it('puts a member with no roles below position 0', () => {
		// 0 is a legitimate rank for the default role, so "no roles" cannot be 0.
		expect(rankOf(member([]))).toBeLessThan(0);
	});

	it('puts the owner above everyone', () => {
		expect(rankOf(OWNER)).toBeGreaterThan(rankOf(member([role('top', 9999, [])])));
	});
});

describe('managing roles', () => {
	const manager = member([role('admin', 5, ['roles.manage'])]);

	it('allows editing a strictly lower role', () => {
		expect(canManageRole(manager, 4)).toBe(true);
	});

	it('refuses the role granting the power, so nobody escalates through it', () => {
		expect(canManageRole(manager, 5)).toBe(false);
	});

	it('refuses a higher role', () => {
		expect(canManageRole(manager, 6)).toBe(false);
	});

	it('refuses without roles.manage however senior', () => {
		expect(canManageRole(member([role('boss', 100, [])]), 0)).toBe(false);
	});

	it('lets the owner manage any role', () => {
		expect(canManageRole(OWNER, 9999)).toBe(true);
	});
});

describe('managing members', () => {
	const manager = member([role('admin', 5, ['members.manage'])]);

	it('allows acting on someone ranked lower', () => {
		expect(canManageMember(manager, member([role('staff', 1, [])]))).toBe(true);
	});

	it('refuses a peer at the same rank', () => {
		expect(canManageMember(manager, member([role('peer', 5, [])]))).toBe(false);
	});

	it('refuses the owner, even to the owner', () => {
		expect(canManageMember(OWNER, OWNER)).toBe(false);
		expect(canManageMember(manager, OWNER)).toBe(false);
	});

	it('refuses without members.manage', () => {
		expect(canManageMember(member([role('boss', 100, [])]), member([role('x', 1, [])]))).toBe(false);
	});
});

describe('granting', () => {
	it('refuses to let an editor grant what they do not hold', () => {
		// Otherwise roles.manage alone is a two-click escalation to everything.
		const editor = member([role('admin', 5, ['roles.manage', 'halls.manage'])]);
		const grantable = grantablePermissions(editor);
		expect(grantable.has('halls.manage')).toBe(true);
		expect(grantable.has('billing.manage')).toBe(false);
	});

	it('counts a per-member allow as held', () => {
		const editor = member([role('admin', 5, ['roles.manage'])], { allow: ['billing.manage'] });
		expect(grantablePermissions(editor).has('billing.manage')).toBe(true);
	});

	it('lets the owner grant everything', () => {
		expect(grantablePermissions(OWNER).size).toBe(PERMISSIONS.length);
	});
});

describe('the sock-puppet escalation', () => {
	// Found by the adversarial pass. Rank alone gates role ASSIGNMENT, but a role
	// ranked below the actor can still carry a permission above them. Alice holds
	// Administrator (rank 10) without billing.manage; a "Finance" role at rank 3
	// carries it. She cannot act on herself, but she can invite an address she
	// controls and assign Finance to it — ending up in control of an account with
	// a permission she could never grant herself.
	const alice = member([role('Administrator', 10, ['members.manage', 'invites.manage', 'roles.manage'])]);
	const finance = role('Finance', 3, ['billing.manage']);

	it('passes the rank check, which is why rank alone is not enough', () => {
		expect(canManageRole(alice, finance.position)).toBe(true);
	});

	it('is caught by comparing the role against what the actor may grant', () => {
		const grantable = grantablePermissions(alice);
		const beyond = finance.permissions.filter((p) => !grantable.has(p));
		expect(beyond).toEqual(['billing.manage']);
	});

	it('allows a role whose permissions the actor does hold', () => {
		// Only permissions on Alice's own role: that is the whole point of the check.
		const deputy = role('Deputy', 3, ['members.manage', 'invites.manage']);
		const grantable = grantablePermissions(alice);
		expect(deputy.permissions.filter((p) => !grantable.has(p))).toEqual([]);
	});

	it('lets the owner assign anything', () => {
		const grantable = grantablePermissions(OWNER);
		expect(finance.permissions.filter((p) => !grantable.has(p))).toEqual([]);
	});
});

describe('who may reach the management console', () => {
	// The /app/manage layout gates on this list alone, so what is in it decides who
	// sees the operator console across the whole platform.

	it('names only manage permissions, never a view one', () => {
		// A view permission here would open the console to every ordinary member:
		// the default role grants five of them.
		expect(CONSOLE_PERMISSIONS.filter((p) => p.endsWith('.view'))).toEqual([]);
	});

	it('leaves an ordinary member outside', () => {
		const ordinary = member([role('Member', 0, DEFAULT_ROLE_PERMISSIONS)]);
		const held = effectivePermissions(ordinary);
		expect(CONSOLE_PERMISSIONS.filter((p) => held.has(p))).toEqual([]);
	});

	it('lets a custom role in on one manage permission', () => {
		// The case the whole conversion exists for: before it, this member was
		// redirected off every console page regardless of what they were granted.
		const editor = member([role('Site editor', 5, ['settings.manage'])]);
		const held = effectivePermissions(editor);
		expect(CONSOLE_PERMISSIONS.some((p) => held.has(p))).toBe(true);
	});

	it('lets an administrator in', () => {
		const admin = member([role('Administrator', 10, ADMINISTRATOR_PERMISSIONS)]);
		const held = effectivePermissions(admin);
		expect(CONSOLE_PERMISSIONS.some((p) => held.has(p))).toBe(true);
	});

	it('only lists permissions this build understands', () => {
		expect(sanitize(CONSOLE_PERMISSIONS)).toEqual(CONSOLE_PERMISSIONS);
	});

	it('keeps the default role within what an Administrator holds', () => {
		// A member must never hold something an admin of the same org does not.
		const beyond = DEFAULT_ROLE_PERMISSIONS.filter((p) => !ADMINISTRATOR_PERMISSIONS.includes(p));
		expect(beyond).toEqual([]);
	});
});

describe('the legacy admin flag', () => {
	const defaultOnly = () => member([role('Member', 0, DEFAULT_ROLE_PERMISSIONS)]);

	it('reads as every Administrator permission, so a panel shows what the guards grant', () => {
		const admin = withLegacyAdmin(defaultOnly(), 'admin');
		expect([...effectivePermissions(admin)].sort()).toEqual([...ADMINISTRATOR_PERMISSIONS].sort());
		expect(can(admin, 'billing.manage')).toBe(false);
	});

	it('changes nothing for a member or the owner', () => {
		expect(withLegacyAdmin(defaultOnly(), 'member').roles).toHaveLength(1);
		expect(withLegacyAdmin(OWNER, 'admin')).toBe(OWNER);
	});

	it('is applied once however often it is read', () => {
		const twice = withLegacyAdmin(withLegacyAdmin(defaultOnly(), 'admin'), 'admin');
		expect(twice.roles.filter((r) => r.id === LEGACY_ADMIN_ROLE_ID)).toHaveLength(1);
	});

	it('still loses to a per-member deny', () => {
		const admin = withLegacyAdmin(member([], { deny: ['settings.manage'] }), 'admin');
		expect(can(admin, 'settings.manage')).toBe(false);
	});

	it('hands out no rank of its own', () => {
		expect(rankOf(withLegacyAdmin(defaultOnly(), 'admin'))).toBe(0);
	});
});

describe('granting the Admin access level', () => {
	it('is open to the owner', () => {
		expect(canGrantAdminAccess(OWNER)).toBe(true);
	});

	it('is open to a full Administrator', () => {
		expect(canGrantAdminAccess(member([role('Administrator', 10, ADMINISTRATOR_PERMISSIONS)]))).toBe(true);
	});

	// The report's case: settings denied to an admin, who then invites a second
	// account as Admin and walks back into settings through it.
	it('is refused to an admin with any Administrator permission denied', () => {
		const limited = withLegacyAdmin(member([], { deny: ['settings.manage'] }), 'admin');
		expect(canGrantAdminAccess(limited)).toBe(false);
	});

	it('is refused to a custom role that only manages members', () => {
		expect(canGrantAdminAccess(member([role('People', 5, ['members.manage', 'invites.manage'])]))).toBe(false);
	});
});

describe('role names', () => {
	it('treat case and surrounding spaces as the same name', () => {
		expect(sameRoleName('Čašník', ' čašník ')).toBe(true);
		expect(sameRoleName('Čašník', 'Čašníčka')).toBe(false);
	});
});
