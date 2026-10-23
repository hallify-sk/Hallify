import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { actions } from './+page.server';

const open: DatabaseSync[] = [];
afterEach(() => {
	for (const d of open.splice(0)) d.close();
});

function setup() {
	const sqlite = new DatabaseSync(':memory:');
	open.push(sqlite);
	const sql = (n: string) => readFileSync(new URL(`../../../../../migrations/${n}`, import.meta.url), 'utf8');
	sqlite.exec(sql('0001_baseline.sql'));
	sqlite.exec(sql('0002_rate_limits.sql'));
	sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Venue','venue')");
	sqlite.exec(sql('0007_roles_and_permissions.sql'));
	const hash = bcrypt.hashSync('secret-pass', 4);
	sqlite
		.prepare(
			"INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('u-owner','owner@x.sk',?,'Olga','Owner'), ('u-member','m@x.sk','h','Marek','Member')"
		)
		.run(hash);
	sqlite.exec(
		"INSERT INTO organization_members(id,org_id,user_id,role) VALUES ('m1','o1','u-owner','owner'), ('m2','o1','u-member','member')"
	);

	const stmt = (q: string, args: unknown[]) => ({
		q,
		args,
		first: async () => (sqlite.prepare(q).get(...(args as never[])) as unknown) ?? null,
		run: async () => ({ meta: { changes: Number(sqlite.prepare(q).run(...(args as never[])).changes) } }),
		all: async () => ({ results: sqlite.prepare(q).all(...(args as never[])) })
	});
	const db = {
		prepare: (q: string) => ({ bind: (...args: unknown[]) => stmt(q, args) }),
		batch: async (list: ReturnType<typeof stmt>[]) => {
			sqlite.exec('BEGIN');
			for (const s of list) sqlite.prepare(s.q).run(...(s.args as never[]));
			sqlite.exec('COMMIT');
			return [];
		}
	};
	return { sqlite, db };
}

function event(db: unknown, role: 'owner' | 'admin', form: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(form)) body.append(k, v);
	return {
		request: new Request('http://localhost/app/manage/members?/transferOwnership', { method: 'POST', body }),
		locals: {
			db,
			locale: 'sk',
			user: { id: 'u-owner', email: 'owner@x.sk' },
			currentOrg: { id: 'o1', name: 'Venue', slug: 'venue', role }
		}
	};
}

const roleOf = (sqlite: DatabaseSync, id: string) =>
	(sqlite.prepare('SELECT role FROM organization_members WHERE user_id = ?').get(id) as { role: string }).role;

describe('transferOwnership (M11)', () => {
	it('hands the org over and makes the old owner an administrator', async () => {
		const { sqlite, db } = setup();
		const res = await actions.transferOwnership(event(db, 'owner', { user_id: 'u-member', password: 'secret-pass' }) as never);
		expect(res).toMatchObject({ success: true });
		expect(roleOf(sqlite, 'u-member')).toBe('owner');
		expect(roleOf(sqlite, 'u-owner')).toBe('admin');
		const adminRow = sqlite
			.prepare(
				"SELECT 1 AS ok FROM org_member_roles mr JOIN org_roles r ON r.id = mr.role_id WHERE mr.user_id = 'u-owner' AND r.name = 'Administrator'"
			)
			.get();
		expect(adminRow).toBeTruthy();
	});

	it('refuses a wrong password and changes nothing', async () => {
		const { sqlite, db } = setup();
		const res = await actions.transferOwnership(event(db, 'owner', { user_id: 'u-member', password: 'nope' }) as never);
		expect(res).toMatchObject({ status: 400 });
		expect(roleOf(sqlite, 'u-owner')).toBe('owner');
	});

	it('is the owner’s alone', async () => {
		const { sqlite, db } = setup();
		const res = await actions.transferOwnership(event(db, 'admin', { user_id: 'u-member', password: 'secret-pass' }) as never);
		expect(res).toMatchObject({ status: 403 });
		expect(roleOf(sqlite, 'u-member')).toBe('member');
	});
});
