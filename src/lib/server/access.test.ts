import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAll, dbFirst } from '$lib/db/index';
import { requireOrgPermission } from './access';
import type { OrgContext } from '../../app.d';

vi.mock('$lib/db/index', () => ({ dbAll: vi.fn(), dbFirst: vi.fn() }));

const db = {} as App.Locals['db'];

function locals(role: OrgContext['role']): App.Locals {
	return {
		db,
		user: { id: 'u1' },
		currentOrg: { id: 'org1', name: 'Org', slug: 'org', logoUrl: null, role }
	} as unknown as App.Locals;
}

/** No role rows, no override row: the shape a member gets in an org whose roles
 *  were never seeded, and the shape `loadMemberAccess` falls back to pre-0007. */
function noRolesAtAll() {
	vi.mocked(dbAll).mockResolvedValue([]);
	vi.mocked(dbFirst).mockResolvedValue(null as never);
}

/** Only the built-in default role, i.e. view permissions and nothing else. */
function onlyDefaultRole() {
	vi.mocked(dbAll).mockResolvedValue([]);
	vi.mocked(dbFirst).mockImplementation(async (_db, sql: string) =>
		sql.includes('is_default')
			? ({
					id: 'r-default',
					name: 'Member',
					position: 0,
					permissions: JSON.stringify(['reservations.view', 'halls.view', 'members.view'])
				} as never)
			: (null as never)
	);
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe('requireOrgPermission', () => {
	it('lets the owner through without reading any role', async () => {
		noRolesAtAll();
		await expect(requireOrgPermission(locals('owner'), 'settings.manage')).resolves.toMatchObject({
			id: 'org1'
		});
		expect(dbAll).not.toHaveBeenCalled();
	});

	// The conversion's real regression risk: `changeRole` and an invite sent with
	// role=admin but no role picked both produce an admin with no Administrator role
	// row, and a pre-0007 database gives every member no roles at all. Each of those
	// admins passes requireOrgStaff, so refusing them here would be a narrowing.
	it('keeps a legacy admin who holds no Administrator role row', async () => {
		noRolesAtAll();
		await expect(requireOrgPermission(locals('admin'), 'settings.manage')).resolves.toMatchObject({
			id: 'org1'
		});
	});

	it('keeps a legacy admin who holds only the view-only default role', async () => {
		onlyDefaultRole();
		await expect(requireOrgPermission(locals('admin'), 'members.manage')).resolves.toMatchObject({
			id: 'org1'
		});
	});

	// The fallback grants the Administrator set, which deliberately stops short of
	// billing — that one stays with the owner.
	it('does not hand a legacy admin billing.manage', async () => {
		noRolesAtAll();
		await expect(requireOrgPermission(locals('admin'), 'billing.manage')).rejects.toMatchObject({
			status: 403
		});
	});

	// Added as a role, not as a bypass, so an explicit per-member denial still wins.
	it('still honours a deny override against a legacy admin', async () => {
		vi.mocked(dbAll).mockResolvedValue([]);
		vi.mocked(dbFirst).mockImplementation(async (_db, sql: string) =>
			sql.includes('org_member_overrides')
				? ({ allow: '[]', deny: JSON.stringify(['settings.manage']) } as never)
				: (null as never)
		);
		await expect(requireOrgPermission(locals('admin'), 'settings.manage')).rejects.toMatchObject({
			status: 403
		});
	});

	// Members hold only view permissions, and every converted gate names a manage
	// permission, so they stay shut out exactly as requireOrgStaff shut them out.
	it('refuses a plain member holding only the default role', async () => {
		onlyDefaultRole();
		await expect(requireOrgPermission(locals('member'), 'settings.manage')).rejects.toMatchObject({
			status: 403
		});
	});

	it('admits a member whose custom role carries the permission', async () => {
		vi.mocked(dbAll).mockResolvedValue([
			{
				id: 'r-ops',
				name: 'Operations',
				position: 5,
				permissions: JSON.stringify(['settings.manage'])
			}
		]);
		vi.mocked(dbFirst).mockResolvedValue(null as never);
		await expect(requireOrgPermission(locals('member'), 'settings.manage')).resolves.toMatchObject({
			id: 'org1'
		});
	});
});
