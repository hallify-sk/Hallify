import { describe, expect, it } from 'vitest';
import {
	PERMISSIONS,
	can,
	canManageMember,
	canManageRole,
	effectivePermissions,
	grantablePermissions,
	parsePermissions,
	rankOf,
	sanitize,
	type MemberAccess,
	type MemberRole,
	type Permission
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
