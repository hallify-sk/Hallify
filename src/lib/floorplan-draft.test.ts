import { describe, expect, it } from 'vitest';
import { buildDraft, pathToPolygon, describeWall } from './floorplan-draft';

/** Shoelace area; signed sum, so a ring with a hole nets outer minus inner. */
const area = (pts: { x: number; y: number }[]) =>
	Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

describe('pathToPolygon', () => {
	it('a straight run is the rectangle of its thickness', () => {
		expect(pathToPolygon({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], thickness: 0.4, closed: false })).toEqual([
			{ x: 0, y: 0.2 }, { x: 10, y: 0.2 }, { x: 10, y: -0.2 }, { x: 0, y: -0.2 }
		]);
	});

	it('an L corner is mitred: one outline, no notch, no overlap', () => {
		const poly = pathToPolygon({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }], thickness: 0.4, closed: false });
		expect(poly).toHaveLength(6);
		// The outer corner sits exactly half a thickness out on both axes.
		expect(poly).toContainEqual({ x: 10.2, y: -0.2 });
		expect(poly).toContainEqual({ x: 9.8, y: 0.2 });
		// Area = centreline length × thickness for a mitred corner.
		expect(area(poly)).toBeCloseTo(18 * 0.4, 6);
	});

	it('a wall all the way round is one ring with the room as its hole', () => {
		const ring = pathToPolygon({
			points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
			thickness: 0.5, closed: true
		});
		// Outer 20.5 × 10.5 minus inner 19.5 × 9.5.
		expect(area(ring)).toBeCloseTo(20.5 * 10.5 - 19.5 * 9.5, 6);
	});

	it('a curve made of short runs stays smooth (constant thickness all along)', () => {
		const arc = Array.from({ length: 9 }, (_, i) => {
			const a = (Math.PI / 2) * (i / 8);
			return { x: 5 * Math.cos(a), y: 5 * Math.sin(a) };
		});
		const poly = pathToPolygon({ points: arc, thickness: 0.4, closed: false });
		// Travelling anticlockwise, the left side is the inside of the curve.
		const inner = poly.slice(0, 9).map((p) => Math.hypot(p.x, p.y));
		const outer = poly.slice(9).map((p) => Math.hypot(p.x, p.y));
		// Every mitred point stays within a hair of its radius: no corner pokes out or in.
		for (const r of inner) expect(r).toBeCloseTo(4.8, 2);
		for (const r of outer) expect(r).toBeCloseTo(5.2, 2);
	});

	it('caps the mitre of a hairpin turn', () => {
		const poly = pathToPolygon({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0.5 }], thickness: 0.4, closed: false });
		for (const p of poly) expect(p.x).toBeLessThan(10 + 0.2 * 4 + 0.01);
	});
});

describe('buildDraft', () => {
	const room = { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 12 }, { x: 0, y: 12 }], thickness: 0.4, closed: true };

	it('builds walls, zones and bounds, shifted to start a metre in', () => {
		const r = buildDraft([room], [{ label: 'Pódium', color: null, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 3 }, { x: 0, y: 3 }] }]);
		if (!r.ok) throw new Error(r.error);
		expect(r.draft.walls).toHaveLength(1);
		expect(r.draft.zones[0]).toMatchObject({ label: 'Pódium', color: '#f05ca1' });
		// A 0.4 m wall becomes one grid step (0.5 m): outer width 20 + 0.5.
		expect(r.draft.size.w).toBeCloseTo(20.5, 3);
		expect(r.draft.bounds).toMatchObject({ x: 1, y: 1 });
	});

	it('refuses impossible input instead of drawing nonsense', () => {
		expect(buildDraft([], []).ok).toBe(false);
		expect(buildDraft([{ points: [{ x: 0, y: 0 }, { x: 9999, y: 0 }], thickness: 0.3, closed: false }], []).ok).toBe(false);
		expect(buildDraft([{ points: [{ x: 0, y: 0 }, { x: NaN, y: 0 }], thickness: 0.3, closed: false }], []).ok).toBe(false);
		expect(buildDraft([room], [{ label: 'x', color: null, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }]).ok).toBe(false);
	});

	it('puts every corner, every thickness and the room size on the 0.5 m grid', () => {
		const odd = { points: [{ x: 0.13, y: 0.07 }, { x: 18.72, y: 0.31 }, { x: 18.6, y: 11.94 }, { x: 0.2, y: 12.1 }], thickness: 0.35, closed: true };
		const inner = { points: [{ x: 6.1, y: 0.2 }, { x: 6.2, y: 4.9 }], thickness: 0.12, closed: false };
		const curve = { points: Array.from({ length: 7 }, (_, i) => ({ x: 9 + 3 * Math.cos((Math.PI * i) / 12), y: 6 + 3 * Math.sin((Math.PI * i) / 12) })), thickness: 0.6, closed: false };
		const r = buildDraft([odd, inner, curve], [{ label: 'Bar', color: null, points: [{ x: 1.1, y: 1.2 }, { x: 4.3, y: 1.2 }, { x: 4.3, y: 2.9 }, { x: 1.1, y: 2.9 }] }]);
		if (!r.ok) throw new Error(r.error);
		const onGrid = (v: number) => Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-9;
		const pts = [...r.draft.walls.flatMap((w) => w.points), ...r.draft.zones.flatMap((z) => z.points)];
		for (const p of pts) { expect(onGrid(p.x)).toBe(true); expect(onGrid(p.y)).toBe(true); }
		const b = r.draft.bounds;
		for (const v of [b.x, b.y, b.w, b.h]) expect(onGrid(v)).toBe(true);
		// The thin inner wall is still drawn, one grid step thick.
		expect(r.draft.walls.length).toBe(3);
		const thin = r.draft.walls[1].points;
		const xs = thin.map((p) => p.x);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.5, 9);
	});

	it('skips runs too short to be walls', () => {
		const r = buildDraft([room, { points: [{ x: 5, y: 5 }, { x: 5, y: 5 }], thickness: 0.3, closed: false }], []);
		if (!r.ok) throw new Error(r.error);
		expect(r.draft.walls).toHaveLength(1);
	});
});

describe('describeWall', () => {
	it('reads a box wall back as its centre line and thickness', () => {
		const box = pathToPolygon({ points: [{ x: 2, y: 3 }, { x: 12, y: 3 }], thickness: 0.6, closed: false });
		const d = describeWall(box);
		if (d.kind !== 'run') throw new Error('expected a run');
		// A wall has no direction: either end may come first.
		expect([d.from, d.to]).toEqual(expect.arrayContaining([{ x: 2, y: 3 }, { x: 12, y: 3 }]));
		expect(d.thickness).toBe(0.6);
	});
	it('gives any other wall as its outline', () => {
		const l = pathToPolygon({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }], thickness: 0.4, closed: false });
		expect(describeWall(l).kind).toBe('outline');
	});
});
