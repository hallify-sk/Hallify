/**
 * Floor-plan geometry: where a table's chairs sit, how much floor a table takes,
 * what it may not overlap, the room's outline, and how many of each table type a
 * layout uses.
 *
 * Pure, so the editor and the server agree on every rule and the rules are tested
 * directly. Units are metres throughout.
 *
 * The room is a set of rectangles that join into one shape: an L-shaped hall is
 * two of them, a U three. A floor keeps the bounding box in `bounds` as well, so
 * everything that only frames the plan (previews, print, the assistant) keeps
 * working without knowing about the parts.
 */

import type { BoundsRect, FloorData, Point, SeatObj, TableObj, WallObj } from './floorplan-types';
import { migrateToMultiFloor } from './floorplan-types';

/** Half the side of a chair as the editor draws it (a 0.42 m square). */
export const CHAIR_R = 0.21;
/** Gap between a table's edge and the chairs around it. */
export const TABLE_GAP = 0.06;
/** Collision radius of a standalone chair. */
export const SEAT_R = 0.26;

/** Touching is allowed; only a real overlap counts. Keeps tables pushed flush
 *  together (a banquet row) from reading as a collision through rounding. */
const EPS = 1e-6;

// ─── Chairs ──────────────────────────────────────────────────────────────────

export type ChairPos = { x: number; y: number; rot: number };

export function totalChairs(t: TableObj): number {
	if (t.shape === 'round') return Number(t.chairs) || 0;
	return (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) +
		(Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0);
}

/** Chair centres in the table's own (unrotated) frame. */
export function localChairs(t: TableObj): ChairPos[] {
	const gap = Math.max(0, Number(t.chairSpacing ?? 0.05));
	const step = 2 * CHAIR_R + gap;

	if (t.shape === 'round') {
		const n = Number(t.chairs) || 0;
		if (n === 0) return [];
		// Chairs sit on a circle, so spacing means pushing the ring out until the arc
		// between neighbours is at least one chair plus the gap.
		const r = roundChairRing(t);
		return Array.from({ length: n }, (_, i) => {
			const a = (i / n) * 2 * Math.PI - Math.PI / 2;
			return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (a * 180 / Math.PI) + 90 };
		});
	}

	const hw = Number(t.width) / 2, hh = Number(t.height) / 2;
	function side(n: number, perp: number, horiz: boolean, rot: number): ChairPos[] {
		if (n <= 0) return [];
		const total = n * 2 * CHAIR_R + (n - 1) * gap;
		const start = -total / 2 + CHAIR_R;
		return Array.from({ length: n }, (_, i) => ({
			x: horiz ? start + i * step : perp,
			y: horiz ? perp : start + i * step,
			rot
		}));
	}
	return [
		...side(Number(t.chairsTop) || 0, -hh - TABLE_GAP - CHAIR_R, true, 180),
		...side(Number(t.chairsBottom) || 0, hh + TABLE_GAP + CHAIR_R, true, 0),
		...side(Number(t.chairsRight) || 0, hw + TABLE_GAP + CHAIR_R, false, 270),
		...side(Number(t.chairsLeft) || 0, -hw - TABLE_GAP - CHAIR_R, false, 90),
	];
}

function roundChairRing(t: TableObj): number {
	const n = Number(t.chairs) || 0;
	const gap = Math.max(0, Number(t.chairSpacing ?? 0.05));
	const minRadius = Number(t.radius) + TABLE_GAP + CHAIR_R;
	const needed = n > 1 ? (2 * CHAIR_R + gap) / (2 * Math.sin(Math.PI / n)) : 0;
	return Math.max(minRadius, needed);
}

/**
 * How a rectangular table of a given type is dressed when it is placed: chairs
 * down the long sides first, as many as fit, then the ends, and anything left
 * over back on the long sides. A type says how many chairs it seats, not where,
 * so this is the sensible default the planner can then rearrange.
 */
export function defaultChairSides(width: number, height: number, chairs: number, spacing: number):
	{ chairsTop: number; chairsBottom: number; chairsLeft: number; chairsRight: number } {
	const n = Math.max(0, Math.floor(chairs));
	const step = 2 * CHAIR_R + Math.max(0, spacing);
	const fit = (len: number) => Math.max(0, Math.floor((len + Math.max(0, spacing)) / step + EPS));
	const wide = width >= height;
	const longFit = fit(wide ? width : height), shortFit = fit(wide ? height : width);

	let a = 0, b = 0, c = 0, d = 0;   // long side 1, long side 2, end 1, end 2
	let left = n;
	const take = (cap: number) => { const k = Math.min(cap, left); left -= k; return k; };
	a = take(Math.ceil(Math.min(n, 2 * longFit) / 2));
	b = take(longFit);
	c = take(Math.ceil(Math.min(left, 2 * shortFit) / 2));
	d = take(shortFit);
	while (left > 0) { if (a <= b) a++; else b++; left--; }

	return wide
		? { chairsTop: a, chairsBottom: b, chairsLeft: c, chairsRight: d }
		: { chairsLeft: a, chairsRight: b, chairsTop: c, chairsBottom: d };
}

// ─── Footprints ─────────────────────────────────────────────────────────────

/** The floor a table takes, chairs included. A rectangle (rotated with the table)
 *  or a circle. */
export type Hitbox =
	| { type: 'circle'; cx: number; cy: number; r: number }
	| { type: 'rect'; cx: number; cy: number; corners: Point[] };

export function tableHitbox(t: TableObj): Hitbox {
	const cx = Number(t.x), cy = Number(t.y);
	if (t.shape === 'round') {
		const r = (Number(t.chairs) || 0) > 0 ? roundChairRing(t) + CHAIR_R : Number(t.radius);
		return { type: 'circle', cx, cy, r };
	}
	// Body plus every chair, in the table's own frame. Taking the chairs as they are
	// laid out (not a fixed margin per side) covers chairs that run past the corners
	// when a side holds more than its length.
	const hw = Number(t.width) / 2, hh = Number(t.height) / 2;
	let l = -hw, r = hw, top = -hh, bot = hh;
	for (const c of localChairs(t)) {
		l = Math.min(l, c.x - CHAIR_R); r = Math.max(r, c.x + CHAIR_R);
		top = Math.min(top, c.y - CHAIR_R); bot = Math.max(bot, c.y + CHAIR_R);
	}
	return { type: 'rect', cx, cy, corners: rotate([[l, top], [r, top], [r, bot], [l, bot]], cx, cy, Number(t.rotation) || 0) };
}

export function seatHitbox(s: SeatObj): Hitbox {
	return { type: 'circle', cx: Number(s.x), cy: Number(s.y), r: SEAT_R };
}

function rotate(local: [number, number][], cx: number, cy: number, deg: number): Point[] {
	const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
	return local.map(([dx, dy]) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }));
}

// ─── Primitive tests ─────────────────────────────────────────────────────────

export function pointInPoly(p: Point, poly: Point[]): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
		if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function segDistSq(p: Point, a: Point, b: Point): number {
	const dx = b.x - a.x, dy = b.y - a.y;
	const lenSq = dx * dx + dy * dy;
	const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
	const ex = p.x - (a.x + t * dx), ey = p.y - (a.y + t * dy);
	return ex * ex + ey * ey;
}

/** Does any stretch of segment a–b run through the INSIDE of a convex polygon?
 *  Cyrus–Beck clipping: exact whether the segment crosses an edge, passes through a
 *  corner, or lies wholly inside, and a segment that only touches the outline does
 *  not count. */
function segmentEntersConvex(a: Point, b: Point, poly: Point[]): boolean {
	// Orientation, so every edge normal points inwards.
	let area = 0;
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i], q = poly[(i + 1) % poly.length];
		area += p.x * q.y - q.x * p.y;
	}
	const sign = area >= 0 ? 1 : -1;
	let tIn = 0, tOut = 1;
	const dx = b.x - a.x, dy = b.y - a.y;
	for (let i = 0; i < poly.length; i++) {
		const p = poly[i], q = poly[(i + 1) % poly.length];
		const nx = -(q.y - p.y) * sign, ny = (q.x - p.x) * sign;
		const len = Math.hypot(nx, ny);
		if (len === 0) continue;
		// Inside means strictly past the edge by EPS.
		const num = ((a.x - p.x) * nx + (a.y - p.y) * ny) / len - EPS;
		const den = (dx * nx + dy * ny) / len;
		if (Math.abs(den) < 1e-12) { if (num <= 0) return false; continue; }
		const t = -num / den;
		if (den > 0) tIn = Math.max(tIn, t); else tOut = Math.min(tOut, t);
		if (tIn >= tOut) return false;
	}
	return tOut - tIn > 1e-9;
}

function segmentHitsHitbox(a: Point, b: Point, hb: Hitbox): boolean {
	if (hb.type === 'circle') return segDistSq({ x: hb.cx, y: hb.cy }, a, b) < (hb.r - EPS) ** 2;
	return segmentEntersConvex(a, b, hb.corners);
}

function polysOverlap(a: Point[], b: Point[]): boolean {
	for (const poly of [a, b]) {
		for (let i = 0; i < poly.length; i++) {
			const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
			const ex = p2.x - p1.x, ey = p2.y - p1.y;
			const len = Math.hypot(ex, ey);
			if (len === 0) continue;
			const ax = -ey / len, ay = ex / len;
			let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
			for (const p of a) { const d = p.x * ax + p.y * ay; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
			for (const p of b) { const d = p.x * ax + p.y * ay; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
			if (maxA <= minB + EPS || maxB <= minA + EPS) return false;
		}
	}
	return true;
}

export function hitboxesOverlap(a: Hitbox, b: Hitbox): boolean {
	if (a.type === 'circle' && b.type === 'circle') {
		return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - EPS;
	}
	if (a.type === 'rect' && b.type === 'rect') return polysOverlap(a.corners, b.corners);
	const rect = (a.type === 'rect' ? a : b) as Extract<Hitbox, { type: 'rect' }>;
	const circ = (a.type === 'circle' ? a : b) as Extract<Hitbox, { type: 'circle' }>;
	if (pointInPoly({ x: circ.cx, y: circ.cy }, rect.corners)) return true;
	for (let i = 0; i < rect.corners.length; i++) {
		if (segDistSq({ x: circ.cx, y: circ.cy }, rect.corners[i], rect.corners[(i + 1) % rect.corners.length]) < (circ.r - EPS) ** 2) return true;
	}
	return false;
}

/** Walls are solid filled shapes, so a table collides with one by crossing its
 *  outline OR by standing wholly inside it (a pillar, a thick wall block). */
export function hitboxHitsWall(hb: Hitbox, wall: WallObj): boolean {
	const pts = wall.points.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
	if (pts.length < 2) return false;
	for (let i = 0; i < pts.length; i++) {
		if (segmentHitsHitbox(pts[i], pts[(i + 1) % pts.length], hb)) return true;
	}
	return pts.length >= 3 && pointInPoly({ x: hb.cx, y: hb.cy }, pts);
}

// ─── The room ────────────────────────────────────────────────────────────────

/** The rectangles a floor's room is made of. Old plans have a single `bounds`. */
export function roomParts(floor: Pick<FloorData, 'bounds' | 'boundsParts'>): BoundsRect[] {
	const parts = Array.isArray(floor.boundsParts) ? floor.boundsParts.filter(validRect) : [];
	if (parts.length) return parts.map(numRect);
	return floor.bounds && validRect(floor.bounds) ? [numRect(floor.bounds)] : [];
}

/** Write a room back onto a floor: the parts, and their bounding box in `bounds`
 *  for everything that only frames the plan. One part is stored as plain `bounds`,
 *  exactly as before parts existed. */
export function withRoom<T extends FloorData>(floor: T, parts: BoundsRect[]): T {
	const out = { ...floor, bounds: partsBBox(parts) };
	if (parts.length > 1) out.boundsParts = parts.map(numRect);
	else delete out.boundsParts;
	return out;
}

export function partsBBox(parts: BoundsRect[]): BoundsRect | null {
	if (!parts.length) return null;
	const x = Math.min(...parts.map((p) => p.x)), y = Math.min(...parts.map((p) => p.y));
	const r = Math.max(...parts.map((p) => p.x + p.w)), b = Math.max(...parts.map((p) => p.y + p.h));
	return { x, y, w: r - x, h: b - y };
}

function validRect(r: unknown): r is BoundsRect {
	const o = r as BoundsRect | null;
	return !!o && [o.x, o.y, o.w, o.h].every((v) => Number.isFinite(Number(v))) && Number(o.w) > 0 && Number(o.h) > 0;
}
function numRect(r: BoundsRect): BoundsRect {
	return { x: Number(r.x), y: Number(r.y), w: Number(r.w), h: Number(r.h) };
}

export function pointInRoom(p: Point, parts: BoundsRect[]): boolean {
	return parts.some((r) => p.x >= r.x - EPS && p.x <= r.x + r.w + EPS && p.y >= r.y - EPS && p.y <= r.y + r.h + EPS);
}

export type Segment = [Point, Point];

/**
 * The outline of the joined rectangles: every rectangle edge, less the stretches
 * that run inside another rectangle or along a seam where two meet. Drawn as the
 * room's border, and the line a table may not cross.
 */
export function roomOutline(parts: BoundsRect[]): Segment[] {
	const out: Segment[] = [];
	parts.forEach((a, ai) => {
		const others = parts.filter((_, i) => i !== ai);
		// Each edge: the fixed coordinate, the span along it, and which way is "out".
		const edges: { horiz: boolean; at: number; from: number; to: number; out: 1 | -1 }[] = [
			{ horiz: true, at: a.y, from: a.x, to: a.x + a.w, out: -1 },
			{ horiz: true, at: a.y + a.h, from: a.x, to: a.x + a.w, out: 1 },
			{ horiz: false, at: a.x, from: a.y, to: a.y + a.h, out: -1 },
			{ horiz: false, at: a.x + a.w, from: a.y, to: a.y + a.h, out: 1 },
		];
		for (const e of edges) {
			// Stretches of this edge with another rectangle just beyond it are inside
			// the room, not on its border.
			const covered: [number, number][] = [];
			for (const b of others) {
				const lo = e.horiz ? b.y : b.x, hi = e.horiz ? b.y + b.h : b.x + b.w;
				const probe = e.at + e.out * 1e-4;
				if (probe <= lo || probe >= hi) continue;
				const s0 = e.horiz ? b.x : b.y, s1 = e.horiz ? b.x + b.w : b.y + b.h;
				covered.push([Math.max(e.from, s0), Math.min(e.to, s1)]);
			}
			for (const [s, t] of subtract([e.from, e.to], covered)) {
				out.push(e.horiz
					? [{ x: s, y: e.at }, { x: t, y: e.at }]
					: [{ x: e.at, y: s }, { x: e.at, y: t }]);
			}
		}
	});
	// Two identical rectangles would each keep the same edge; draw it once.
	const seen = new Set<string>();
	return out.filter(([p, q]) => {
		const k = [p.x, p.y, q.x, q.y].map((v) => v.toFixed(4)).join(',');
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

function subtract([from, to]: [number, number], cuts: [number, number][]): [number, number][] {
	let pieces: [number, number][] = [[from, to]];
	for (const [c0, c1] of cuts) {
		if (c1 - c0 <= EPS) continue;
		pieces = pieces.flatMap(([p0, p1]) => {
			if (c1 <= p0 || c0 >= p1) return [[p0, p1] as [number, number]];
			const keep: [number, number][] = [];
			if (c0 > p0) keep.push([p0, c0]);
			if (c1 < p1) keep.push([c1, p1]);
			return keep;
		});
	}
	return pieces.filter(([a, b]) => b - a > 1e-4);
}

/** How much edge two parts must share to count as joined: about a doorway. */
export const MIN_JOIN_M = 1;

/** Two parts are joined when they overlap, or share at least `minShared` metres of
 *  edge. Meeting at a corner only is not a way through. */
export function partsJoined(a: BoundsRect, b: BoundsRect, minShared = MIN_JOIN_M): boolean {
	const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
	const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
	if (ox > EPS && oy > EPS) return true;            // they overlap
	if (Math.abs(ox) <= EPS) return oy >= minShared - EPS; // side by side
	if (Math.abs(oy) <= EPS) return ox >= minShared - EPS; // one above the other
	return false;
}

/** Whether every part of a room can be reached from every other through joined parts. */
export function partsConnected(parts: BoundsRect[], minShared = MIN_JOIN_M): boolean {
	if (parts.length <= 1) return true;
	const seen = new Set([0]);
	const queue = [0];
	while (queue.length) {
		const i = queue.pop()!;
		parts.forEach((p, j) => {
			if (!seen.has(j) && partsJoined(parts[i], p, minShared)) { seen.add(j); queue.push(j); }
		});
	}
	return seen.size === parts.length;
}

/** Whether a rectangle lies wholly inside the room already (inside one part, or
 *  across several), so adding it as a part would add no floor at all. */
export function rectCovered(rect: BoundsRect, parts: BoundsRect[]): boolean {
	if (!parts.length) return false;
	const inside = (x: number, y: number) => parts.some((p) => x > p.x - EPS && x < p.x + p.w + EPS && y > p.y - EPS && y < p.y + p.h + EPS);
	// Cut the rectangle along every part edge that crosses it; it is covered when the
	// middle of every resulting cell is.
	const xs = [...new Set([rect.x, rect.x + rect.w, ...parts.flatMap((p) => [p.x, p.x + p.w])])]
		.filter((x) => x >= rect.x - EPS && x <= rect.x + rect.w + EPS).sort((a, b) => a - b);
	const ys = [...new Set([rect.y, rect.y + rect.h, ...parts.flatMap((p) => [p.y, p.y + p.h])])]
		.filter((y) => y >= rect.y - EPS && y <= rect.y + rect.h + EPS).sort((a, b) => a - b);
	for (let i = 0; i < xs.length - 1; i++) {
		for (let j = 0; j < ys.length - 1; j++) {
			if (xs[i + 1] - xs[i] <= EPS || ys[j + 1] - ys[j] <= EPS) continue;
			if (!inside((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)) return false;
		}
	}
	return true;
}

/** Floor area of the joined rectangles, overlaps counted once. */
export function roomArea(parts: BoundsRect[]): number {
	if (!parts.length) return 0;
	const xs = [...new Set(parts.flatMap((p) => [p.x, p.x + p.w]))].sort((a, b) => a - b);
	const ys = [...new Set(parts.flatMap((p) => [p.y, p.y + p.h]))].sort((a, b) => a - b);
	let area = 0;
	for (let i = 0; i < xs.length - 1; i++) {
		for (let j = 0; j < ys.length - 1; j++) {
			const mx = (xs[i] + xs[i + 1]) / 2, my = (ys[j] + ys[j + 1]) / 2;
			if (parts.some((p) => mx > p.x && mx < p.x + p.w && my > p.y && my < p.y + p.h)) {
				area += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
			}
		}
	}
	return area;
}

/** SVG path for the outline, scaled (previews draw at 10 units per metre). */
export function roomOutlinePath(parts: BoundsRect[], scale = 1, offX = 0, offY = 0): string {
	return roomOutline(parts)
		.map(([p, q]) => `M${p.x * scale + offX} ${p.y * scale + offY}L${q.x * scale + offX} ${q.y * scale + offY}`)
		.join('');
}

/** Is the whole footprint on the room's floor? No room drawn means anywhere goes. */
export function hitboxInRoom(hb: Hitbox, parts: BoundsRect[], outline: Segment[] = roomOutline(parts)): boolean {
	if (!parts.length) return true;
	if (!pointInRoom({ x: hb.cx, y: hb.cy }, parts)) return false;
	// The centre is on the floor; the footprint is wholly on it unless the outline
	// runs through it somewhere.
	return !outline.some(([a, b]) => segmentHitsHitbox(a, b, hb));
}

// ─── Table inventory ─────────────────────────────────────────────────────────

export interface InventoryType { id: string; name: string; amount: number }
export interface InventoryOverage { typeId: string; name: string; used: number; amount: number }

/** Tables placed of each type, across every floor of a layout. */
export function countTablesByType(floors: Pick<FloorData, 'tables'>[]): Map<string, number> {
	const used = new Map<string, number>();
	for (const f of floors) for (const t of f.tables ?? []) {
		if (t.typeId) used.set(t.typeId, (used.get(t.typeId) ?? 0) + 1);
	}
	return used;
}

/** Types a layout uses more of than the venue owns. `amount` 0 means unlimited. */
export function inventoryOverage(layoutRaw: unknown, types: InventoryType[]): InventoryOverage[] {
	const used = countTablesByType(migrateToMultiFloor(layoutRaw).floors);
	return types
		.filter((t) => Number(t.amount) > 0 && (used.get(t.id) ?? 0) > Number(t.amount))
		.map((t) => ({ typeId: t.id, name: t.name, used: used.get(t.id) ?? 0, amount: Number(t.amount) }));
}
