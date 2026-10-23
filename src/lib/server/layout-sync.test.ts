import { describe, expect, it } from 'vitest';
import { d1, migratedSqlite } from './test-d1';
import { prepareLayoutSave, refreshLayoutProblems, syncHallLayouts } from './layout-sync';
import { parseProblems } from '$lib/floorplan-sync';

/** A date `days` from today, as YYYY-MM-DD (UTC, as SQLite's date('now')). */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const table = (id: string, x: number, y: number) => ({
	id, x, y, width: 2, height: 1, radius: 0.8, shape: 'rect', chairs: 0, rotation: 0, label: id, num: Number(id.slice(1)),
	chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.05, assignments: []
});
const pillar = (x: number, y: number) => ({ id: 'p1', points: [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }] });

/** The hall's plan: one 10 × 8 m room on floor `f1`, optionally with walls. */
const hallPlan = (walls: unknown[] = []) => ({
	version: 2, guests: [],
	floors: [{ id: 'f1', name: 'Sála', walls, zones: [], tables: [], seats: [], bounds: { x: 0, y: 0, w: 10, h: 8 } }]
});
/** A layout on that hall: T1 at (3, 4), T2 at (7, 6). */
const layout = () => JSON.stringify({
	version: 2, guests: [{ id: 'g1', firstName: 'A', lastName: 'B' }],
	floors: [{ id: 'f1', name: 'Sála', walls: [], zones: [], bounds: { x: 0, y: 0, w: 10, h: 8 },
		tables: [table('t1', 3, 4), table('t2', 7, 6)], seats: [] }]
});

function setup() {
	const sqlite = migratedSqlite();
	const before = JSON.stringify(hallPlan());
	sqlite.exec(`INSERT INTO organizations(id,name,slug) VALUES ('o1','Org','org');
		INSERT INTO users(id,email,password_hash,first_name,last_name) VALUES ('u1','a@b.sk','x','Ana','B');`);
	sqlite.prepare(`INSERT INTO halls(id,org_id,name,slug,floorplan_json) VALUES ('h1','o1','One','one',?)`).run(before);
	const tpl = (id: string, json: string | null) =>
		sqlite.prepare(`INSERT INTO floorplan_templates(id,hall_id,name,layout_json) VALUES (?,?,?,?)`).run(id, 'h1', id, json);
	const ev = (id: string, date: string, status = 'approved', json: string | null = layout()) =>
		sqlite.prepare(`INSERT INTO reservations(id,org_id,hall_id,user_id,title,event_date,status,invite_code,layout_json) VALUES (?,?,?,?,?,?,?,?,?)`)
			.run(id, 'o1', 'h1', 'u1', id, date, status, `code-${id}`, json);
	const row = (sql: string, id: string) => sqlite.prepare(sql).get(id) as { layout_json: string | null; layout_problems: string | null };
	return {
		sqlite, db: d1(sqlite), before, tpl, ev,
		template: (id: string) => row('SELECT layout_json, layout_problems FROM floorplan_templates WHERE id = ?', id),
		event: (id: string) => row('SELECT layout_json, layout_problems FROM reservations WHERE id = ?', id),
		setHall: (json: string) => sqlite.prepare('UPDATE halls SET floorplan_json = ? WHERE id = ?').run(json, 'h1')
	};
}

describe('syncHallLayouts', () => {
	it('lays the new room under templates and upcoming events, flags what no longer fits, and reports it', async () => {
		const s = setup();
		s.tpl('tpl', layout());
		s.tpl('empty', '{}');
		s.ev('soon', inDays(10));
		s.ev('past', inDays(-10));
		s.ev('cancelled', inDays(10), 'cancelled');
		// A pillar now stands where T1 is.
		const next = JSON.stringify(hallPlan([pillar(3, 3.8)]));
		s.setHall(next);

		const report = await syncHallLayouts(s.db, 'h1', s.before, next);
		expect(report.failed).toBeUndefined();
		expect(report.templates).toEqual([{ id: 'tpl', name: 'tpl', problems: 1 }]);
		expect(report.events.map((e) => [e.id, e.problems])).toEqual([['soon', 1]]);

		const tpl = s.template('tpl');
		expect(parseProblems(tpl.layout_problems)).toMatchObject([{ id: 't1', item: 'table', kind: 'wall', tag: 'T1' }]);
		const stored = JSON.parse(tpl.layout_json!);
		expect(stored.floors[0].walls).toHaveLength(1);
		expect(stored.floors[0].tables.map((t: { id: string }) => t.id)).toEqual(['t1', 't2']);
		expect(stored.guests).toHaveLength(1);

		expect(parseProblems(s.event('soon').layout_problems)).toHaveLength(1);
		// Past and cancelled events keep the room they had, unflagged; an empty template stays empty.
		expect(s.event('past').layout_json).toBe(layout());
		expect(s.event('past').layout_problems).toBeNull();
		expect(s.event('cancelled').layout_problems).toBeNull();
		expect(s.template('empty').layout_json).toBe('{}');
	});

	it('clears the flag when the hall plan changes back', async () => {
		const s = setup();
		s.tpl('tpl', layout());
		const broken = JSON.stringify(hallPlan([pillar(3, 3.8)]));
		await syncHallLayouts(s.db, 'h1', s.before, broken);
		expect(s.template('tpl').layout_problems).not.toBeNull();
		const report = await syncHallLayouts(s.db, 'h1', broken, s.before);
		expect(report.templates).toEqual([]);
		expect(s.template('tpl').layout_problems).toBeNull();
	});

	it('tells the team when a save leaves layouts worse, once, and not when it fixes them (D12)', async () => {
		const s = setup();
		s.tpl('tpl', layout());
		s.ev('soon', inDays(10));
		const rows = () => s.sqlite.prepare(
			`SELECT kind, link, actor_id, params FROM org_notifications WHERE org_id = 'o1' ORDER BY created_at`).all() as
			{ kind: string; link: string; actor_id: string | null; params: string }[];
		const notify = { orgId: 'o1', actorId: 'u1' };
		const broken = JSON.stringify(hallPlan([pillar(3, 3.8)]));

		// Without a notify context (a sync that is not a person's save) nothing is written.
		await syncHallLayouts(s.db, 'h1', s.before, s.before);
		expect(rows()).toHaveLength(0);

		await syncHallLayouts(s.db, 'h1', s.before, broken, notify);
		expect(rows()).toHaveLength(1);
		expect(rows()[0]).toMatchObject({ kind: 'layout.problems', link: '/app/manage/halls/h1', actor_id: 'u1' });
		expect(JSON.parse(rows()[0].params)).toMatchObject({ hall: 'One', templates: 1, events: 1 });

		// An autosave of the same plan adds nothing new: no second ring.
		const before = rows();
		await syncHallLayouts(s.db, 'h1', broken, broken, notify);
		expect(rows()).toEqual(before);

		// Fixing it is not news either.
		await syncHallLayouts(s.db, 'h1', broken, s.before, notify);
		expect(rows()).toEqual(before);
	});

	it('never fails the hall save it follows', async () => {
		const broken = { prepare: () => { throw new Error('db down'); } } as unknown as Parameters<typeof syncHallLayouts>[0];
		expect(await syncHallLayouts(broken, 'h1', null, '{}')).toEqual({ templates: [], events: [], failed: true });
	});
});

describe('prepareLayoutSave', () => {
	it("puts a layout saved from an editor opened on the old room onto the hall's current one", () => {
		const hall = JSON.stringify(hallPlan([pillar(3, 3.8)]));
		const save = prepareLayoutSave(layout(), hall);
		expect(save.roomChanged).toBe(true);
		expect(JSON.parse(save.json).floors[0].walls).toHaveLength(1);
		expect(save.problems.map((p) => p.id)).toEqual(['t1']);
		expect(save.column).not.toBeNull();
	});

	it('clears the problems of a fixed layout, and leaves a non-following event as it is', () => {
		const hall = JSON.stringify(hallPlan([pillar(3, 3.8)]));
		const fixed = JSON.parse(layout());
		fixed.floors[0].tables[0].x = 6;
		fixed.floors[0].tables[0].y = 2;
		const save = prepareLayoutSave(JSON.stringify(fixed), hall);
		expect(save.problems).toEqual([]);
		expect(save.column).toBeNull();
		const past = prepareLayoutSave(layout(), hall, false);
		expect(past).toEqual({ json: layout(), problems: [], column: null, roomChanged: false });
	});
});

describe('refreshLayoutProblems', () => {
	it('measures what is stored against the hall, for templates and following events only', async () => {
		const s = setup();
		s.setHall(JSON.stringify(hallPlan([pillar(3, 3.8)])));
		s.tpl('tpl', layout());
		s.ev('soon', inDays(10));
		s.ev('past', inDays(-10));
		expect(await refreshLayoutProblems(s.db, 'template', 'tpl')).toHaveLength(1);
		expect(parseProblems(s.template('tpl').layout_problems)).toHaveLength(1);
		expect(await refreshLayoutProblems(s.db, 'event', 'soon')).toHaveLength(1);
		expect(await refreshLayoutProblems(s.db, 'event', 'past')).toEqual([]);
		expect(s.event('past').layout_problems).toBeNull();
	});
});
