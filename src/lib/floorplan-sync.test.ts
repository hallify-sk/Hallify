import { describe, expect, it } from 'vitest';
import {
	applyHallGeometry, followsHallPlan, hasLayout, layoutProblems, matchFloors, parseProblems, problemsColumn, roomKey
} from './floorplan-sync';

const table = (id: string, x: number, y: number, over: Record<string, unknown> = {}) => ({
	id, x, y, width: 2, height: 1, radius: 0.8, shape: 'rect', chairs: 0, rotation: 0, label: id,
	chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.05, assignments: [], ...over
});
const square = (id: string, x: number, y: number, s: number) => ({
	id, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
});
const zone = (id: string, x: number) => ({ id, label: id, color: '#f05ca1', points: [{ x, y: 1 }, { x: x + 1, y: 1 }, { x: x + 1, y: 2 }, { x, y: 2 }] });

/** A hall: one 10 × 8 m room, optionally with a pillar and zones, on floor `f1`. */
const hall = (over: Record<string, unknown> = {}, floors: Record<string, unknown>[] = []) => ({
	version: 2, guests: [],
	floors: [
		{ id: 'f1', name: 'Sála', walls: [], zones: [zone('stage', 1)], tables: [], seats: [], bounds: { x: 0, y: 0, w: 10, h: 8 }, ...over },
		...floors
	]
});

/** A template on that hall with two tables, an event zone and the hall's stage. */
const template = () => ({
	version: 2,
	guests: [{ id: 'g1', firstName: 'A', lastName: 'B' }],
	floors: [{
		id: 'f1', name: 'Sála', walls: [], bounds: { x: 0, y: 0, w: 10, h: 8 },
		zones: [zone('stage', 1), zone('dance', 6)],
		tables: [table('t1', 3, 4, { num: 1, assignments: ['g1'] }), table('t2', 7, 6, { num: 2 })],
		seats: [{ id: 's1', x: 8, y: 2, rotation: 0, assignment: null }]
	}]
});

describe('matchFloors', () => {
	it('matches by id, and a removed floor is -1', () => {
		expect(matchFloors([{ id: 'a' }, { id: 'b' }, { id: 'x' }], [{ id: 'b' }, { id: 'a' }])).toEqual([1, 0, -1]);
	});
	it('falls back to position when no id is shared (plans from before lasting floor ids)', () => {
		expect(matchFloors([{ id: 'r1' }, { id: 'r2' }], [{ id: 'h1' }])).toEqual([0, -1]);
	});
	it('never gives one hall floor to two layout floors', () => {
		expect(matchFloors([{ id: 'a' }, { id: 'a' }], [{ id: 'a' }])).toEqual([0, -1]);
	});
});

describe('applyHallGeometry', () => {
	it("lays the hall's new room under the layout and keeps its tables, guests and event zones", () => {
		const next = hall({ name: 'Veľká sála', bounds: { x: 0, y: 0, w: 12, h: 9 }, walls: [square('p1', 5, 5, 0.4)], zones: [zone('stage', 2), zone('bar', 9)] });
		const out = applyHallGeometry(template(), next, hall());
		const f = out.floors[0];
		expect(f.name).toBe('Veľká sála');
		expect(f.bounds).toEqual({ x: 0, y: 0, w: 12, h: 9 });
		expect(f.walls.map((w) => w.id)).toEqual(['p1']);
		// The hall's zones as the hall has them now, then the layout's own.
		expect(f.zones.map((z) => z.id)).toEqual(['stage', 'bar', 'dance']);
		expect(f.zones[0].points[0].x).toBe(2);
		expect(f.tables.map((t) => t.id)).toEqual(['t1', 't2']);
		expect(f.tables[0].assignments).toEqual(['g1']);
		expect(f.seats?.map((s) => s.id)).toEqual(['s1']);
		expect(out.guests.map((g) => g.id)).toEqual(['g1']);
	});

	it('drops a zone the hall removed, when the previous plan is known', () => {
		const out = applyHallGeometry(template(), hall({ zones: [] }), hall());
		expect(out.floors[0].zones.map((z) => z.id)).toEqual(['dance']);
	});

	it('writes a room of several parts with its bounding box', () => {
		const parts = [{ x: 0, y: 0, w: 10, h: 4 }, { x: 0, y: 4, w: 4, h: 4 }];
		const out = applyHallGeometry(template(), hall({ bounds: { x: 0, y: 0, w: 10, h: 8 }, boundsParts: parts }));
		expect(out.floors[0].boundsParts).toEqual(parts);
		expect(out.floors[0].bounds).toEqual({ x: 0, y: 0, w: 10, h: 8 });
		// And back to one rectangle: the parts go.
		expect(applyHallGeometry(out, hall()).floors[0].boundsParts).toBeUndefined();
	});

	it('adds a floor the hall added, empty, and keeps a removed floor only while it has furniture', () => {
		const tpl = template();
		tpl.floors.push({ id: 'f2', name: 'Balkón', walls: [], zones: [], bounds: null, tables: [table('t3', 2, 2)], seats: [] } as never);
		tpl.floors.push({ id: 'f3', name: 'Terasa', walls: [], zones: [], bounds: null, tables: [], seats: [] } as never);
		const next = hall({}, [{ id: 'f4', name: 'Pivnica', walls: [], zones: [], tables: [], seats: [], bounds: { x: 0, y: 0, w: 5, h: 5 } }]);
		const out = applyHallGeometry(tpl, next);
		expect(out.floors.map((f) => f.id)).toEqual(['f1', 'f4', 'f2']);
		expect(out.floors[1].tables).toEqual([]);
	});

	it('takes the hall floor ids for a layout matched by position', () => {
		const tpl = template();
		tpl.floors[0].id = 'random';
		expect(applyHallGeometry(tpl, hall()).floors[0].id).toBe('f1');
	});

	it('is stable: applying twice gives the same JSON', () => {
		const once = applyHallGeometry(template(), hall({ walls: [square('p1', 5, 5, 0.4)] }));
		const twice = applyHallGeometry(once, hall({ walls: [square('p1', 5, 5, 0.4)] }));
		expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
	});

	it('does not touch its inputs', () => {
		const tpl = template();
		const before = JSON.stringify(tpl);
		applyHallGeometry(tpl, hall({ zones: [] }));
		expect(JSON.stringify(tpl)).toBe(before);
	});
});

describe('layoutProblems', () => {
	it('finds nothing wrong with a layout that fits', () => {
		expect(layoutProblems(template(), hall())).toEqual([]);
	});

	it('flags a table in a pillar, a table off a smaller room, and a chair in a wall', () => {
		const next = hall({ bounds: { x: 0, y: 0, w: 7, h: 8 }, walls: [square('pillar', 2.8, 3.8, 0.4), square('w', 7.8, 1.8, 0.4)] });
		const out = layoutProblems(applyHallGeometry(template(), next), next);
		expect(out).toEqual([
			{ id: 't1', item: 'table', kind: 'wall', tag: 'T1', floor: 'Sála' },
			{ id: 't2', item: 'table', kind: 'outside', tag: 'T2', floor: 'Sála' },
			{ id: 's1', item: 'chair', kind: 'wall', tag: null, floor: 'Sála' }
		]);
	});

	it('flags the furniture of a floor the hall no longer has', () => {
		const tpl = template();
		tpl.floors.push({ id: 'f2', name: 'Balkón', walls: [], zones: [], bounds: null, tables: [table('t3', 2, 2, { num: 3 })], seats: [] } as never);
		const out = layoutProblems(applyHallGeometry(tpl, hall()), hall());
		expect(out).toEqual([{ id: 't3', item: 'table', kind: 'floor', tag: 'T3', floor: 'Balkón' }]);
	});

	it('counts chairs round a table as part of it', () => {
		// The body clears the wall at x = 4.2, the chairs on its right do not.
		const tpl = template();
		tpl.floors[0].tables = [table('t1', 3, 4, { chairsRight: 1 })];
		const next = hall({ walls: [square('w', 4.3, 3, 2)] });
		expect(layoutProblems(tpl, next).map((p) => p.kind)).toEqual(['wall']);
	});
});

describe('roomKey', () => {
	it('ignores furniture and seating, but not walls or zones', () => {
		const a = applyHallGeometry(template(), hall());
		const moved = JSON.parse(JSON.stringify(a));
		moved.floors[0].tables[0].x = 1;
		moved.guests = [];
		expect(roomKey(moved)).toBe(roomKey(a));
		expect(roomKey(applyHallGeometry(a, hall({ walls: [square('p', 1, 1, 1)] })))).not.toBe(roomKey(a));
	});
});

describe('helpers', () => {
	it('hasLayout tells a stored layout from an empty column', () => {
		expect(hasLayout(null)).toBe(false);
		expect(hasLayout('')).toBe(false);
		expect(hasLayout('{"version":2,"floors":[]}')).toBe(false);
		expect(hasLayout(JSON.stringify(template()))).toBe(true);
		expect(hasLayout({ tables: [] })).toBe(true);
	});

	it('stores problems as JSON or NULL, and reads them back defensively', () => {
		const p = [{ id: 't1', item: 'table', kind: 'wall', tag: 'T1', floor: 'Sála' }] as const;
		expect(problemsColumn([])).toBeNull();
		expect(parseProblems(problemsColumn([...p]))).toEqual(p);
		expect(parseProblems('nonsense')).toEqual([]);
		expect(parseProblems('[{"id":"x","kind":"melted"}]')).toEqual([]);
	});

	it('followsHallPlan: upcoming, live events only', () => {
		const now = Date.parse('2026-10-23T12:00:00Z');
		expect(followsHallPlan({ status: 'approved', event_date: '2026-11-01' }, now)).toBe(true);
		expect(followsHallPlan({ status: 'pending', event_date: '2026-10-23', start_time: '18:00' }, now)).toBe(true);
		expect(followsHallPlan({ status: 'planned', event_date: '2026-10-23', start_time: '10:00' }, now)).toBe(false);
		expect(followsHallPlan({ status: 'approved', event_date: '2026-10-01' }, now)).toBe(false);
		expect(followsHallPlan({ status: 'completed', event_date: '2026-11-01' }, now)).toBe(false);
		expect(followsHallPlan({ status: 'cancelled', event_date: '2026-11-01' }, now)).toBe(false);
	});
});
