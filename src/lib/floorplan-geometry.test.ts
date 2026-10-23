import { describe, expect, it } from 'vitest';
import type { FloorData, TableObj } from './floorplan-types';
import {
	partsJoined, partsConnected, rectCovered,
	countTablesByType, defaultChairSides, hitboxHitsWall, hitboxInRoom, hitboxesOverlap,
	inventoryOverage, localChairs, roomArea, roomOutline, roomParts, seatHitbox, tableHitbox, withRoom, CHAIR_R
} from './floorplan-geometry';

const rect = (over: Partial<TableObj> = {}): TableObj => ({
	id: 't', x: 0, y: 0, width: 2, height: 1, radius: 1, shape: 'rect', chairs: 0, rotation: 0, label: '',
	chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.15, assignments: [], ...over
});
const round = (over: Partial<TableObj> = {}): TableObj => rect({ shape: 'round', radius: 0.8, width: 1.6, height: 1.6, ...over });

// An L: a 10 × 4 strip along the top and a 4 × 6 leg down the left.
const L = [{ x: 0, y: 0, w: 10, h: 4 }, { x: 0, y: 4, w: 4, h: 6 }];

describe('table footprint', () => {
	it('covers chairs that run past the corners of a crowded side', () => {
		// Five chairs on a 1 m side need ~2.7 m — the old box stopped at the table's width.
		const t = rect({ width: 1, height: 1, chairsTop: 5 });
		const chairs = localChairs(t);
		const reach = Math.max(...chairs.map((c) => c.x)) + CHAIR_R;
		const hb = tableHitbox(t);
		if (hb.type !== 'rect') throw new Error('rect expected');
		expect(Math.max(...hb.corners.map((c) => c.x))).toBeCloseTo(reach);
		// A chair beside it, where those overhanging chairs are, now collides.
		expect(hitboxesOverlap(hb, seatHitbox({ id: 's', x: reach - 0.1, y: -0.8, rotation: 0, assignment: null }))).toBe(true);
	});

	it('grows a round table to its chair ring when spacing pushes the ring out', () => {
		const t = round({ radius: 0.5, chairs: 12, chairSpacing: 0.3 });
		const ring = Math.hypot(localChairs(t)[0].x, localChairs(t)[0].y);
		const hb = tableHitbox(t);
		expect(hb.type === 'circle' && hb.r).toBeCloseTo(ring + CHAIR_R);
	});

	it('lets tables stand flush against each other', () => {
		const a = tableHitbox(rect({ x: 0, chairsTop: 3, chairsBottom: 3 }));
		const b = tableHitbox(rect({ x: 2, chairsTop: 3, chairsBottom: 3 }));
		expect(hitboxesOverlap(a, b)).toBe(false);
		const c = tableHitbox(rect({ x: 1.9, chairsTop: 3, chairsBottom: 3 }));
		expect(hitboxesOverlap(a, c)).toBe(true);
	});

	it('still touches flush when rotated a quarter turn', () => {
		const a = tableHitbox(rect({ x: 0, rotation: 90 }));
		const b = tableHitbox(rect({ x: 1, rotation: 90 }));
		expect(hitboxesOverlap(a, b)).toBe(false);
	});
});

describe('walls', () => {
	const pillar = { id: 'w', points: [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 3, y: 3 }, { x: -3, y: 3 }] };

	it('blocks a table standing wholly inside a wall block', () => {
		expect(hitboxHitsWall(tableHitbox(rect()), pillar)).toBe(true);
		expect(hitboxHitsWall(tableHitbox(round()), pillar)).toBe(true);
	});

	it('blocks a table with a small pillar wholly under it', () => {
		const small = { id: 'p', points: [{ x: -0.1, y: -0.1 }, { x: 0.1, y: -0.1 }, { x: 0.1, y: 0.1 }, { x: -0.1, y: 0.1 }] };
		expect(hitboxHitsWall(tableHitbox(rect()), small)).toBe(true);
	});

	it('allows a table pushed flat against a wall', () => {
		const wall = { id: 'w', points: [{ x: 1, y: -5 }, { x: 2, y: -5 }, { x: 2, y: 5 }, { x: 1, y: 5 }] };
		expect(hitboxHitsWall(tableHitbox(rect({ x: 0 })), wall)).toBe(false);
		expect(hitboxHitsWall(tableHitbox(rect({ x: 0.1 })), wall)).toBe(true);
	});
});

describe('the room', () => {
	it('reads an old single-rectangle plan as one part', () => {
		expect(roomParts({ bounds: { x: 0, y: 0, w: 5, h: 5 } })).toHaveLength(1);
		expect(roomParts({ bounds: null })).toEqual([]);
	});

	it('stores one part exactly as before, and several with their bounding box', () => {
		const floor: FloorData = { id: 'f', name: 'F', walls: [], zones: [], tables: [], bounds: null };
		expect(withRoom(floor, [{ x: 0, y: 0, w: 5, h: 5 }])).not.toHaveProperty('boundsParts');
		const l = withRoom(floor, L);
		expect(l.bounds).toEqual({ x: 0, y: 0, w: 10, h: 10 });
		expect(l.boundsParts).toHaveLength(2);
		expect(roomParts(l)).toEqual(L);
	});

	it('outlines an L without the seam between its parts', () => {
		const segs = roomOutline(L);
		const length = segs.reduce((s, [p, q]) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);
		expect(length).toBeCloseTo(40);   // 10 + 4 + 6 + 6 + 4 + 10
		// The seam y = 4 between x = 0 and 4 is inside the room.
		expect(segs.some(([p, q]) => p.y === 4 && q.y === 4 && p.x < 4 && q.x <= 4)).toBe(false);
		expect(roomArea(L)).toBeCloseTo(64);
	});

	it('counts overlapping parts once', () => {
		expect(roomArea([{ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 2, w: 4, h: 4 }])).toBeCloseTo(28);
	});

	it('keeps tables on the floor of an L-shaped room', () => {
		expect(hitboxInRoom(tableHitbox(rect({ x: 5, y: 2 })), L)).toBe(true);       // top strip
		expect(hitboxInRoom(tableHitbox(rect({ x: 2, y: 7 })), L)).toBe(true);       // the leg
		expect(hitboxInRoom(tableHitbox(rect({ x: 2, y: 4 })), L)).toBe(true);       // across the seam
		expect(hitboxInRoom(tableHitbox(rect({ x: 7, y: 7 })), L)).toBe(false);      // the missing corner
		expect(hitboxInRoom(tableHitbox(rect({ x: 4, y: 4.2 })), L)).toBe(false);    // poking round the inner corner
		expect(hitboxInRoom(tableHitbox(round({ x: 4, y: 4.5 })), L)).toBe(false);
		expect(hitboxInRoom(tableHitbox(rect({ x: 3, y: 5 })), L)).toBe(true);       // flush to the leg's wall
	});

	it('judges a rotated table by its real corners, not its bounding box', () => {
		// 45° in a tight square: the box around it would poke out, the table does not.
		const room = [{ x: -1.3, y: -1.3, w: 2.6, h: 2.6 }];
		expect(hitboxInRoom(tableHitbox(rect({ width: 2, height: 0.5, rotation: 45 })), room)).toBe(true);
	});
});

describe('chairs for a placed table type', () => {
	it('fills the long sides first, then the ends', () => {
		expect(defaultChairSides(2, 1, 6, 0.15)).toEqual({ chairsTop: 3, chairsBottom: 3, chairsLeft: 0, chairsRight: 0 });
		expect(defaultChairSides(2, 1, 8, 0.15)).toEqual({ chairsTop: 3, chairsBottom: 3, chairsLeft: 1, chairsRight: 1 });
		expect(defaultChairSides(2, 1, 4, 0.15)).toEqual({ chairsTop: 2, chairsBottom: 2, chairsLeft: 0, chairsRight: 0 });
	});

	it('turns with a table drawn taller than wide', () => {
		expect(defaultChairSides(1, 2, 6, 0.15)).toEqual({ chairsLeft: 3, chairsRight: 3, chairsTop: 0, chairsBottom: 0 });
	});

	it('always places exactly the number asked for', () => {
		for (const n of [0, 1, 5, 9, 14, 30]) {
			const s = defaultChairSides(1.8, 0.8, n, 0.15);
			expect(s.chairsTop + s.chairsBottom + s.chairsLeft + s.chairsRight).toBe(n);
		}
	});
});

describe('table inventory', () => {
	const layout = {
		version: 2, guests: [],
		floors: [
			{ id: 'a', name: 'A', walls: [], zones: [], bounds: null, tables: [rect({ id: '1', typeId: 'r' }), rect({ id: '2', typeId: 'r' }), rect({ id: '3' })] },
			{ id: 'b', name: 'B', walls: [], zones: [], bounds: null, tables: [rect({ id: '4', typeId: 'r' }), round({ id: '5', typeId: 'o' })] },
		]
	};

	it('counts every floor', () => {
		const used = countTablesByType(layout.floors);
		expect(used.get('r')).toBe(3);
		expect(used.get('o')).toBe(1);
	});

	it('reports only types used beyond what the venue owns', () => {
		const types = [{ id: 'r', name: 'Banquet', amount: 2 }, { id: 'o', name: 'Round', amount: 1 }, { id: 'x', name: 'Bar', amount: 0 }];
		expect(inventoryOverage(JSON.stringify(layout), types)).toEqual([{ typeId: 'r', name: 'Banquet', used: 3, amount: 2 }]);
		expect(inventoryOverage(layout, [{ id: 'r', name: 'Banquet', amount: 0 }])).toEqual([]);
	});
});

describe('room parts must be connected', () => {
	const a = { x: 0, y: 0, w: 10, h: 6 };
	it('joins overlapping parts and parts sharing at least a metre of edge', () => {
		expect(partsJoined(a, { x: 8, y: 2, w: 5, h: 5 })).toBe(true);   // overlap
		expect(partsJoined(a, { x: 10, y: 0, w: 4, h: 3 })).toBe(true);  // side by side, 3 m shared
		expect(partsJoined(a, { x: 2, y: 6, w: 3, h: 3 })).toBe(true);   // below, 3 m shared
	});
	it('does not join parts that touch at a corner, share too little, or have a gap', () => {
		expect(partsJoined(a, { x: 10, y: 6, w: 3, h: 3 })).toBe(false);    // corner only
		expect(partsJoined(a, { x: 10, y: 5.5, w: 3, h: 3 })).toBe(false);  // 0.5 m shared
		expect(partsJoined(a, { x: 10.5, y: 0, w: 3, h: 3 })).toBe(false);  // 0.5 m gap
	});
	it('follows chains, and sees a U split when its middle goes', () => {
		const left = { x: 0, y: 0, w: 3, h: 10 }, bottom = { x: 0, y: 7, w: 12, h: 3 }, right = { x: 9, y: 0, w: 3, h: 10 };
		expect(partsConnected([left, bottom, right])).toBe(true);
		expect(partsConnected([left, right])).toBe(false);
		expect(partsConnected([a])).toBe(true);
		expect(partsConnected([])).toBe(true);
	});
});

describe('rectCovered', () => {
	it('spots a part drawn wholly inside the room, even across two parts', () => {
		expect(rectCovered({ x: 1, y: 1, w: 2, h: 2 }, L)).toBe(true);
		// Spans the seam between the strip and the leg of the L.
		expect(rectCovered({ x: 1, y: 3, w: 2, h: 3 }, L)).toBe(true);
		expect(rectCovered({ x: 0, y: 0, w: 10, h: 4 }, L)).toBe(true);
	});
	it('lets a part through that adds floor', () => {
		expect(rectCovered({ x: 8, y: 3, w: 2, h: 3 }, L)).toBe(false);
		expect(rectCovered({ x: 5, y: 5, w: 2, h: 2 }, L)).toBe(false);
		expect(rectCovered({ x: 0, y: 0, w: 1, h: 1 }, [])).toBe(false);
	});
});
