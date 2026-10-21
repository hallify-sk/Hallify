import type { BoundsRect, Point, WallObj, ZoneObj } from '$lib/floorplan-types';

/**
 * A floor plan drafted from a drawing, turned into what the editor draws.
 *
 * Walls are described the way a drawing shows them — a run of wall through its
 * corners, with a thickness — and each run becomes ONE filled outline with proper
 * mitred corners, which is how the editor stores a wall. Separate boxes per segment
 * overlap and leave notches at every corner; a curve drawn as a run of short
 * segments comes out smooth only if the joins are mitred.
 *
 * Everything is in metres, x to the right and y downwards, as in the editor; the
 * draft is shifted so its top-left corner sits one metre in from the origin.
 */

export interface WallPath { points: { x: number; y: number }[]; thickness: number; closed: boolean }
export interface DraftZoneInput { label: string; color: string | null; points: { x: number; y: number }[] }

export interface FloorplanDraft {
	walls: WallObj[];
	zones: ZoneObj[];
	bounds: BoundsRect;
	size: { w: number; h: number };
}

const ZONE_COLORS = ['#f05ca1', '#2f7a52', '#2f5f9e', '#955f10', '#6b4a9e', '#1f6f72'];
const MAX_WALLS = 200;
const MAX_POINTS = 2000;
const MAX_ZONES = 60;
const LIMIT_M = 500; // no venue on Hallify is half a kilometre across
/** A sharp corner's mitre is capped at this many half-thicknesses, so a hairpin
 *  turn cannot throw a spike across the room. */
const MITER_LIMIT = 4;
const round = (n: number) => Math.round(n * 1000) / 1000;
/** The editor's default grid. Everything a draft produces lands on it, so a drawn
 *  plan lines up with what the user then draws by hand, and with the tables. */
export const DRAFT_GRID = 0.5;
/** Nearest grid line. Ties go up, on both sides of a wall alike, so snapping an
 *  outline shifts a wall by a quarter metre at most but never changes its thickness. */
const toGrid = (n: number) => Math.round(n / DRAFT_GRID) * DRAFT_GRID + 0;
const snapPt = (p: V): V => ({ x: toGrid(p.x), y: toGrid(p.y) });
/** Drop repeated neighbours (and a repeated closing point) left behind by snapping. */
function dedupe(pts: V[]): V[] {
	const out = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
	while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
	return out;
}
const polyArea = (pts: V[]) =>
	Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);

type V = { x: number; y: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: V) => Math.hypot(a.x, a.y);
const unit = (a: V): V => { const l = len(a); return { x: a.x / l, y: a.y / l }; };
const leftNormal = (d: V): V => ({ x: -d.y, y: d.x });

/** Drop points that repeat the previous one (and, for a ring, the first). */
function clean(points: V[], closed: boolean): V[] {
	const out: V[] = [];
	for (const p of points) if (!out.length || len(sub(p, out[out.length - 1])) >= 0.01) out.push(p);
	if (closed && out.length > 2 && len(sub(out[0], out[out.length - 1])) < 0.01) out.pop();
	return out;
}

/**
 * One side of a wall run, offset by `h` (positive = left of the direction of travel),
 * with mitred joins. For an open run the ends are cut square.
 */
function offsetSide(pts: V[], h: number, closed: boolean): V[] {
	const n = pts.length;
	const out: V[] = [];
	for (let i = 0; i < n; i++) {
		const prev = closed ? pts[(i - 1 + n) % n] : pts[i - 1];
		const next = closed ? pts[(i + 1) % n] : pts[i + 1];
		const nIn = prev ? leftNormal(unit(sub(pts[i], prev))) : null;
		const nOut = next ? leftNormal(unit(sub(next, pts[i]))) : null;
		if (!nIn || !nOut) {
			const nrm = (nIn ?? nOut)!;
			out.push({ x: pts[i].x + nrm.x * h, y: pts[i].y + nrm.y * h });
			continue;
		}
		// The mitre: along the bisector of the two normals, long enough that both
		// offset edges meet there — capped for very sharp corners.
		const bis = { x: nIn.x + nOut.x, y: nIn.y + nOut.y };
		const bl = len(bis);
		if (bl < 1e-6) { // a full U-turn: no meeting point, cut it square
			out.push({ x: pts[i].x + nIn.x * h, y: pts[i].y + nIn.y * h });
			continue;
		}
		const m = { x: bis.x / bl, y: bis.y / bl };
		const reach = Math.min(Math.abs(h) / Math.max(m.x * nIn.x + m.y * nIn.y, 1e-6), Math.abs(h) * MITER_LIMIT);
		const s = Math.sign(h);
		out.push({ x: pts[i].x + m.x * reach * s, y: pts[i].y + m.y * reach * s });
	}
	return out;
}

/**
 * A wall run as one outline. Open: up one side and back down the other. Closed (a
 * wall all the way round): the outer ring and the inner ring joined by a seam, in
 * opposite directions, so the room inside is a hole in the fill — one shape, which
 * is what the editor stores.
 */
export function pathToPolygon(path: WallPath): V[] {
	const pts = clean(path.points, path.closed);
	const h = path.thickness / 2;
	const left = offsetSide(pts, h, path.closed);
	const right = offsetSide(pts, -h, path.closed);
	const r = (p: V) => ({ x: round(p.x), y: round(p.y) });
	if (!path.closed) return [...left, ...right.reverse()].map(r);
	return [...left, left[0], right[0], ...right.slice(1).reverse(), right[0]].map(r);
}

const finite = (...ns: unknown[]) => ns.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= LIMIT_M);

export function buildDraft(walls: unknown, zones: unknown): { ok: true; draft: FloorplanDraft } | { ok: false; error: string } {
	const paths = (Array.isArray(walls) ? walls : []) as Partial<WallPath>[];
	const zs = (Array.isArray(zones) ? zones : []) as Partial<DraftZoneInput>[];
	if (!paths.length) return { ok: false, error: 'A floor plan needs at least one wall.' };
	if (paths.length > MAX_WALLS) return { ok: false, error: `At most ${MAX_WALLS} wall runs.` };
	if (zs.length > MAX_ZONES) return { ok: false, error: `At most ${MAX_ZONES} zones.` };
	const pointCount = paths.reduce((n, p) => n + (Array.isArray(p.points) ? p.points.length : 0), 0);
	if (pointCount > MAX_POINTS) return { ok: false, error: `At most ${MAX_POINTS} wall points in total.` };

	const wallPolys: V[][] = [];
	for (const [i, w] of paths.entries()) {
		const raw = Array.isArray(w.points) ? w.points : [];
		if (raw.some((p) => !finite(p?.x, p?.y))) return { ok: false, error: `Wall ${i + 1} has an invalid coordinate.` };
		const closed = w.closed === true;
		const pts = clean(raw.map((p) => snapPt({ x: p.x, y: p.y })), closed);
		if (pts.length < (closed ? 3 : 2)) continue; // a dot, not a wall
		const asked = typeof w.thickness === 'number' && w.thickness >= 0.05 && w.thickness <= 2 ? w.thickness : 0.3;
		// Whole grid steps, at least one: a thinner wall could not have both faces on the grid.
		const thickness = Math.max(DRAFT_GRID, toGrid(asked));
		const outline = dedupe(pathToPolygon({ points: pts, thickness, closed }).map(snapPt));
		if (outline.length < 3 || polyArea(outline) < 1e-6) continue; // snapped flat: too short to draw
		wallPolys.push(outline);
	}
	if (!wallPolys.length) return { ok: false, error: 'Every wall was too short to draw.' };

	const zonePolys: { label: string; color: string; points: V[] }[] = [];
	for (const [i, z] of zs.entries()) {
		const pts = dedupe((Array.isArray(z.points) ? z.points : []).filter((p) => finite(p?.x, p?.y)).map((p) => snapPt({ x: p.x, y: p.y })));
		if (pts.length < 3 || polyArea(pts) < 1e-6) return { ok: false, error: `Zone ${i + 1} needs at least three corners at least half a metre apart.` };
		const color = typeof z.color === 'string' && /^#[0-9a-f]{6}$/i.test(z.color) ? z.color : ZONE_COLORS[i % ZONE_COLORS.length];
		zonePolys.push({ label: String(z.label ?? '').trim().slice(0, 40), color, points: pts });
	}

	// Shift so the plan starts one metre in from the editor's origin.
	const all = [...wallPolys.flat(), ...zonePolys.flatMap((z) => z.points)];
	const minX = Math.min(...all.map((p) => p.x));
	const minY = Math.min(...all.map((p) => p.y));
	const shift = (p: V) => ({ x: round(p.x - minX + 1), y: round(p.y - minY + 1) });
	const wallsOut: WallObj[] = wallPolys.map((pts) => ({ id: crypto.randomUUID(), points: pts.map(shift) }));
	const zonesOut: ZoneObj[] = zonePolys.map((z) => ({ id: crypto.randomUUID(), label: z.label, color: z.color, points: z.points.map(shift) }));

	const moved = [...wallsOut.flatMap((w) => w.points), ...zonesOut.flatMap((z) => z.points)];
	const w = round(Math.max(...moved.map((p) => p.x)) - 1);
	const h = round(Math.max(...moved.map((p) => p.y)) - 1);
	return { ok: true, draft: { walls: wallsOut, zones: zonesOut, bounds: { x: 1, y: 1, w, h }, size: { w, h } } };
}

/**
 * A stored wall, described so the assistant can redraw it. A four-cornered wall is
 * read back as the line down its middle with its thickness (how drafts and most
 * hand-drawn walls come out); any other shape is given as its outline.
 */
export function describeWall(points: V[]): { kind: 'run'; from: V; to: V; thickness: number } | { kind: 'outline'; points: V[] } {
	if (points.length === 4) {
		const [a, b, c, d] = points;
		const sideAB = len(sub(b, a));
		const sideBC = len(sub(c, b));
		// The short sides are the ends; the line runs between their midpoints.
		const [e1, e2, thickness] = sideAB < sideBC
			? [[a, b], [c, d], sideAB] as const
			: [[b, c], [d, a], sideBC] as const;
		const mid = (p: V, q: V) => ({ x: round((p.x + q.x) / 2), y: round((p.y + q.y) / 2) });
		return { kind: 'run', from: mid(e1[0], e1[1]), to: mid(e2[0], e2[1]), thickness: round(thickness) };
	}
	return { kind: 'outline', points: points.map((p) => ({ x: round(p.x), y: round(p.y) })) };
}
