import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { migratedDatabase, d1 } from './sqlite-d1.testutil';
import { writeHallFloorplanOver } from './layout-sync';
import { dbRun, wroteRow } from '$lib/db/index';

const open: DatabaseSync[] = [];
afterEach(() => { for (const d of open.splice(0)) d.close(); });

function database() {
	const s = migratedDatabase();
	open.push(s);
	s.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel')`);
	// An updated_at in the past, so the touch trigger (0020) fires on the next write.
	s.exec(`INSERT INTO halls (id, org_id, name, floorplan_json, updated_at) VALUES ('h1', 'org', 'Sála', '{"v":1}', '2026-01-01 00:00:00')`);
	return s;
}

const plan = (s: DatabaseSync) =>
	s.prepare(`SELECT floorplan_json, updated_at FROM halls WHERE id = 'h1'`).get() as { floorplan_json: string; updated_at: string };

describe('wroteRow', () => {
	it('counts a one-row hall update as written although the trigger makes D1 report 2', async () => {
		const s = database();
		const res = await dbRun(d1(s), `UPDATE halls SET name = 'Nová' WHERE id = 'h1'`);
		expect(res.meta.changes).toBe(2);
		expect(wroteRow(res)).toBe(true);
	});

	it('is false when the guard matched no row', async () => {
		const s = database();
		expect(wroteRow(await dbRun(d1(s), `UPDATE halls SET name = 'Nová' WHERE id = 'nope'`))).toBe(false);
	});
});

describe('writeHallFloorplanOver', () => {
	// The regression: every save from a single editor was answered 409 after it was written.
	it('saves over the plan it was made from and reports it saved', async () => {
		const s = database();
		expect(await writeHallFloorplanOver(d1(s), 'h1', 'org', '{"v":2}', '{"v":1}')).toBe(true);
		expect(plan(s).floorplan_json).toBe('{"v":2}');
		expect(plan(s).updated_at).not.toBe('2026-01-01 00:00:00');
	});

	it('refuses, and writes nothing, when the plan was saved over since', async () => {
		const s = database();
		expect(await writeHallFloorplanOver(d1(s), 'h1', 'org', '{"v":3}', '{"v":0}')).toBe(false);
		expect(plan(s).floorplan_json).toBe('{"v":1}');
	});

	it('writes a first plan over an empty hall, and never another organisation’s hall', async () => {
		const s = database();
		s.exec(`UPDATE halls SET floorplan_json = NULL WHERE id = 'h1'`);
		expect(await writeHallFloorplanOver(d1(s), 'h1', 'other', '{"v":2}', null)).toBe(false);
		expect(await writeHallFloorplanOver(d1(s), 'h1', 'org', '{"v":2}', null)).toBe(true);
		expect(plan(s).floorplan_json).toBe('{"v":2}');
	});
});
