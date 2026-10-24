import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ADMINISTRATOR_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, canManageMember, effectivePermissions } from '$lib/permissions';
import { administratorRoleToAttach, buildAccess, canGrantAdmin, findAdministratorRole, type OrgRole } from './people';

const ROLES: OrgRole[] = [
	{ id: 'r-admin', name: 'Administrator', color: null, position: 1, permissions: ADMINISTRATOR_PERMISSIONS, isDefault: false },
	{ id: 'r-member', name: 'Member', color: null, position: 0, permissions: DEFAULT_ROLE_PERMISSIONS, isDefault: true }
];

describe('buildAccess', () => {
	// B34: the owner's panel showed 6 permissions for an admin the guards gave 16.
	it('reads the legacy admin flag the way the guards do', () => {
		const admin = buildAccess({ isOwner: false, roleIds: [], roles: ROLES, legacyRole: 'admin' });
		expect([...effectivePermissions(admin)].sort()).toEqual([...ADMINISTRATOR_PERMISSIONS].sort());
	});

	it('leaves a plain member with the default role', () => {
		const m = buildAccess({ isOwner: false, roleIds: [], roles: ROLES, legacyRole: 'member' });
		expect([...effectivePermissions(m)].sort()).toEqual([...DEFAULT_ROLE_PERMISSIONS].sort());
	});

	it('lets an admin holding the Administrator row act on plain members', () => {
		const admin = buildAccess({ isOwner: false, roleIds: ['r-admin'], roles: ROLES, legacyRole: 'admin' });
		const plain = buildAccess({ isOwner: false, roleIds: [], roles: ROLES, legacyRole: 'member' });
		expect(canManageMember(admin, plain)).toBe(true);
	});
});

describe('findAdministratorRole', () => {
	it('finds the built-in role by name, never the default one', () => {
		expect(findAdministratorRole(ROLES)?.id).toBe('r-admin');
		expect(findAdministratorRole([ROLES[1]])).toBeUndefined();
	});
});

describe('canGrantAdmin', () => {
	const roles: OrgRole[] = [
		{ ...ROLES[0], position: 8 },
		{ id: 'r-manager', name: 'Manažér', color: null, position: 7, permissions: [], isDefault: false },
		{ ...ROLES[1] }
	];

	// REG-permissions-1: a 'Manažér' under Administrator, holding every Administrator
	// permission through overrides, promoted a member who then outranked them.
	it('refuses an actor ranked below the Administrator role the promotion attaches', () => {
		const manager = buildAccess({
			isOwner: false,
			roleIds: ['r-manager'],
			roles,
			override: { allow: ADMINISTRATOR_PERMISSIONS, deny: [] },
			legacyRole: 'member'
		});
		expect(canGrantAdmin(manager, roles)).toBe(false);
	});

	it('still lets the owner promote', () => {
		expect(canGrantAdmin({ isOwner: true, roles: [] }, roles)).toBe(true);
	});

	it('ignores an Administrator role that would not be attached (it carries billing)', () => {
		const billing: OrgRole[] = roles.map((r) =>
			r.id === 'r-admin' ? { ...r, permissions: [...ADMINISTRATOR_PERMISSIONS, 'billing.manage'] } : r
		);
		expect(administratorRoleToAttach(billing)).toBeUndefined();
		expect(administratorRoleToAttach(roles)?.id).toBe('r-admin');
	});
});

describe('migration 0017', () => {
	const open: DatabaseSync[] = [];
	afterEach(() => {
		for (const d of open.splice(0)) d.close();
	});
	const sql = (name: string) => readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), 'utf8');

	it('attaches the Administrator role to admins that hold only the flag, once', () => {
		const db = new DatabaseSync(':memory:');
		open.push(db);
		db.exec(sql('0001_baseline.sql'));
		db.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Venue','venue')");
		db.exec(sql('0007_roles_and_permissions.sql'));
		for (const [id, role] of [['u-owner', 'owner'], ['u-admin', 'admin'], ['u-member', 'member']]) {
			db.exec(`INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('${id}','${id}@x.sk','h','A','B')`);
			db.exec(`INSERT INTO organization_members(id,org_id,user_id,role) VALUES ('m-${id}','o1','${id}','${role}')`);
		}
		db.exec(sql('0017_admin_role_rows.sql'));
		db.exec(sql('0017_admin_role_rows.sql'));
		const rows = db
			.prepare(
				`SELECT mr.user_id, r.name FROM org_member_roles mr JOIN org_roles r ON r.id = mr.role_id ORDER BY mr.user_id`
			)
			.all();
		expect(rows).toEqual([{ user_id: 'u-admin', name: 'Administrator' }]);
	});
});
