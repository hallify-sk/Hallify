<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import type { FloorData, MultiFloorState, WallObj, ZoneObj, TableObj, Guest, BoundsRect, Point, TableShape } from '$lib/floorplan-types';

	// ─── Props ────────────────────────────────────────────────────────────────
	interface TableType {
		id: string; name: string; shape: 'rect' | 'round';
		width: number; height: number; radius: number;
		max_chairs: number;
	}
	interface Props {
		initialState?: unknown;              // Existing walls/zones/tables to load
		onchange?: (json: string) => void;   // Called whenever state changes
		tableTypes?: TableType[];            // Predefined table inventory from admin
		hiddenTools?: Tool[];                // Tools to hide from toolbar
		protectWallsZones?: boolean;         // Prevent erasing/selecting walls & zones
	}
	const { initialState, onchange, tableTypes, hiddenTools = [], protectWallsZones = false }: Props = $props();

	// ─── Undo / Redo ──────────────────────────────────────────────────────────
	interface Snapshot { floors: FloorData[]; guests: Guest[]; activeFloorIdx: number }
	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);
	let suppressHistory = false;

	function takeSnapshot(): string {
		// Flush working copy into floors before snapshotting
		const currentFloors = floors.map((f, i) =>
			i === activeFloorIdx ? { ...f, walls, zones, tables, bounds } : f
		);
		return JSON.stringify({ floors: currentFloors, guests, activeFloorIdx });
	}
	function pushUndo() {
		undoStack = [...undoStack.slice(-49), takeSnapshot()];
		redoStack = [];
	}
	function undo() {
		if (undoStack.length === 0) return;
		redoStack = [...redoStack, takeSnapshot()];
		const prev = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		restoreSnapshot(prev);
	}
	function redo() {
		if (redoStack.length === 0) return;
		undoStack = [...undoStack, takeSnapshot()];
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		restoreSnapshot(next);
	}
	function restoreSnapshot(json: string) {
		suppressHistory = true;
		try {
			const s = JSON.parse(json) as Snapshot;
			floors = s.floors; guests = s.guests; activeFloorIdx = s.activeFloorIdx;
			const f = floors[activeFloorIdx];
			walls = f.walls; zones = f.zones; tables = f.tables; bounds = f.bounds;
		} catch { /* ignore */ }
		suppressHistory = false;
	}

	// Selected inventory type for placement
	let selectedTypeId = $state<string | null>(null);
	const selectedType = $derived(tableTypes?.find(tt => tt.id === selectedTypeId) ?? null);

	// Auto-select first table type when switching to Place Table tool
	$effect(() => {
		if (tool === 'table' && tableTypes && tableTypes.length > 0) {
			if (!selectedTypeId || !tableTypes.find(tt => tt.id === selectedTypeId)) {
				selectedTypeId = tableTypes[0].id;
			}
		}
	});

	// ─── Types ────────────────────────────────────────────────────────────────
	type Tool       = 'select' | 'wall' | 'zone' | 'table' | 'eraser' | 'bounds' | 'measure';
	type ChairPopover = { tableId: string; chairIdx: number; x: number; y: number };

	// ─── Map state ────────────────────────────────────────────────────────────
	let zoom     = $state(60);
	let gridSnap = $state(0.5);
	let snapDropOpen = $state(false);
	let tool     = $state<Tool>('select');

	// ─── Multi-floor state ────────────────────────────────────────────────────
	let floors = $state<FloorData[]>([{ id: crypto.randomUUID(), name: 'Floor 1', walls: [], zones: [], tables: [], bounds: null }]);
	let activeFloorIdx = $state(0);

	// Working copy of active floor (all mutations use these, synced on floor switch)
	let walls  = $state<WallObj[]>([]);
	let zones  = $state<ZoneObj[]>([]);
	let tables = $state<TableObj[]>([]);

	// Drawing
	let drawPts   = $state<Point[]>([]);
	let cursorPos = $state<Point>({ x: 0, y: 0 });
	let isDrawing = $state(false);

	// New-table config (shown in panel when tool = 'table')
	let tWidth              = $state(2);
	let tHeight             = $state(1);
	let tChairs             = $state(6);
	let tShape              = $state<TableShape>('rect');
	let tChairsTop          = $state(3);
	let tChairsBottom       = $state(3);
	let tChairsLeft         = $state(0);
	let tChairsRight        = $state(0);
	let tChairSpacing       = $state(0.05);

	// Zone config
	let zoneColor = $state('#a78bfa');

	// Bounds (floor plan boundary rectangle)
	let bounds = $state<BoundsRect | null>(null);
	let boundsStart = $state<Point | null>(null);  // first corner during drawing

	// Selection / drag
	let selectedId = $state<string | null>(null);
	let isDragging = $state(false);
	let dragStart  = $state<Point>({ x: 0, y: 0 });
	let elemStart  = $state<Point>({ x: 0, y: 0 });

	// Wall / zone polygon dragging
	let isPolyDragging = $state(false);
	let polyDragStart  = $state<Point>({ x: 0, y: 0 });
	let polyOrigPoints = $state<Point[]>([]);

	// Vertex dragging (reshape wall/zone)
	let isVertexDragging = $state(false);
	let vertexDragIdx    = $state(-1);
	let vertexOrigPos    = $state<Point>({ x: 0, y: 0 });

	// Rotation
	let isRotating    = $state(false);
	let rotCenter     = $state<Point>({ x: 0, y: 0 });
	let rotStartAngle = $state(0);
	let rotStartDeg   = $state(0);

	// Pan
	let panX      = $state(40);
	let panY      = $state(40);
	let isPanning = $state(false);

	// Measure tool
	let measureStart = $state<Point | null>(null);
	let measureEnd   = $state<Point | null>(null);

	// Element snapping
	let snapToElements = $state(true);
	let snapGuides     = $state<{ axis: 'x' | 'y'; value: number }[]>([]);

	// Ruler mouse tracking (screen coords within canvas)
	let rulerMouseX = $state(0);
	let rulerMouseY = $state(0);

	// ─── Guest system ─────────────────────────────────────────────────────────
	let guests       = $state<Guest[]>([]);
	let newFirst     = $state('');
	let newLast      = $state('');
	let newGroup     = $state('');
	let guestSearch  = $state('');
	let chairPopover = $state<ChairPopover | null>(null);
	let activeTab    = $state<'props' | 'guests'>('props');

	// ─── Floor management ────────────────────────────────────────────────────
	/** Flush working copy back into floors array */
	function saveCurrentFloor() {
		floors[activeFloorIdx] = { ...floors[activeFloorIdx], walls, zones, tables, bounds };
	}

	/** Switch to a different floor */
	function loadFloor(idx: number) {
		saveCurrentFloor();
		activeFloorIdx = idx;
		const f = floors[idx];
		walls = f.walls; zones = f.zones; tables = f.tables; bounds = f.bounds;
		selectedId = null; chairPopover = null;
	}

	function addFloor() {
		pushUndo();
		saveCurrentFloor();
		const newFloor: FloorData = {
			id: crypto.randomUUID(), name: `Floor ${floors.length + 1}`,
			walls: [], zones: [], tables: [], bounds: null,
		};
		floors = [...floors, newFloor];
		activeFloorIdx = floors.length - 1;
		walls = []; zones = []; tables = []; bounds = null;
		selectedId = null; chairPopover = null;
	}

	function removeFloor(idx: number) {
		if (floors.length <= 1) return;
		pushUndo();
		saveCurrentFloor();
		floors = floors.filter((_, i) => i !== idx);
		if (activeFloorIdx >= floors.length) activeFloorIdx = floors.length - 1;
		else if (idx < activeFloorIdx) activeFloorIdx--;
		const f = floors[activeFloorIdx];
		walls = f.walls; zones = f.zones; tables = f.tables; bounds = f.bounds;
		selectedId = null; chairPopover = null;
	}

	function renameFloor(idx: number) {
		const name = prompt('Floor name:', floors[idx].name);
		if (name && name.trim()) {
			floors = floors.map((f, i) => i === idx ? { ...f, name: name.trim() } : f);
		}
	}

	// ─── Load initial state from prop ────────────────────────────────────────
	$effect(() => {
		if (!initialState) return;
		try {
			const raw = typeof initialState === 'string' ? JSON.parse(initialState) : initialState;
			const state = migrateToMultiFloor(raw);
			const f0 = state.floors[0]; // use local var, NOT reactive `floors`
			floors = state.floors;
			guests = state.guests;
			activeFloorIdx = 0;
			walls = f0.walls; zones = f0.zones; tables = f0.tables; bounds = f0.bounds;
		} catch { /* ignore parse errors */ }
	});

	// ─── Notify parent of state changes ──────────────────────────────────────
	$effect(() => {
		if (!onchange) return;
		// Access reactive working copy to create dependency
		const snap = { walls, zones, tables, bounds, guests };
		// Read floors without creating deep dependency — use untrack for floors array
		const currentFloors = untrack(() => floors).map((f, i) =>
			i === untrack(() => activeFloorIdx) ? { ...f, ...snap } : f
		);
		const state: MultiFloorState = { version: 2, floors: currentFloors, guests };
		onchange(JSON.stringify(state));
	});

	// ─── SVG ref ──────────────────────────────────────────────────────────────
	let svgEl: SVGSVGElement;

	// ─── Coordinate helpers ───────────────────────────────────────────────────
	const wx = (x: number) => x * zoom + panX;
	const wy = (y: number) => y * zoom + panY;
	const ws = (s: number) => s * zoom;
	const sx = (px: number) => (px - panX) / zoom;
	const sy = (py: number) => (py - panY) / zoom;

	function svgCoords(e: MouseEvent | PointerEvent): Point {
		const r = svgEl.getBoundingClientRect();
		return { x: sx(e.clientX - r.left), y: sy(e.clientY - r.top) };
	}
	function snap(p: Point): Point {
		return { x: Math.round(p.x / gridSnap) * gridSnap, y: Math.round(p.y / gridSnap) * gridSnap };
	}

	// ─── Geometry ─────────────────────────────────────────────────────────────
	function pointInPoly(p: Point, poly: Point[]): boolean {
		let inside = false;
		for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
			if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi)
				inside = !inside;
		}
		return inside;
	}

	function rotatedCorners(t: TableObj): Point[] {
		const a = (Number(t.rotation) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
		const cx = Number(t.x), cy = Number(t.y);
		const hw = Number(t.width) / 2, hh = Number(t.height) / 2;
		return ([ [-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh] ] as [number,number][]).map(([dx,dy]) => ({
			x: cx + dx * cos - dy * sin,
			y: cy + dx * sin + dy * cos
		}));
	}

	// ─── Collision detection ─────────────────────────────────────────────────
	// Simple AABB approach: imagine an axis-aligned bounding box over the entire
	// table INCLUDING chairs. For round tables, use an expanded radius instead.

	const CHAIR_EXT = 0.48; // TABLE_GAP(0.06) + 2×CR(0.42) — how far chairs extend beyond body edge

	/** Get rotated hitbox corners for a table INCLUDING chair extent per side.
	 *  For round tables returns { type:'circle', cx, cy, r }.
	 *  For rect tables returns { type:'rect', corners: Point[4] } — rotated with the table. */
	type Hitbox = { type: 'circle'; cx: number; cy: number; r: number }
		| { type: 'rect'; cx: number; cy: number; corners: Point[] };

	function tableHitbox(t: TableObj): Hitbox {
		const cx = Number(t.x), cy = Number(t.y);
		if (t.shape === 'round') {
			const n = Number(t.chairs) || 0;
			const pad = n > 0 ? CHAIR_EXT : 0;
			return { type: 'circle', cx, cy, r: Number(t.radius) + pad };
		}
		// Rect: expand each side only if it has chairs
		const padT = (Number(t.chairsTop) || 0) > 0 ? CHAIR_EXT : 0;
		const padB = (Number(t.chairsBottom) || 0) > 0 ? CHAIR_EXT : 0;
		const padL = (Number(t.chairsLeft) || 0) > 0 ? CHAIR_EXT : 0;
		const padR = (Number(t.chairsRight) || 0) > 0 ? CHAIR_EXT : 0;
		const hw = Number(t.width) / 2, hh = Number(t.height) / 2;
		// Local-space corners (before rotation): left=-hw-padL, right=hw+padR, top=-hh-padT, bot=hh+padB
		const left = -hw - padL, right = hw + padR, top = -hh - padT, bot = hh + padB;
		const a = (Number(t.rotation) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
		const corners: Point[] = ([
			[left, top], [right, top], [right, bot], [left, bot]
		] as [number, number][]).map(([dx, dy]) => ({
			x: cx + dx * cos - dy * sin,
			y: cy + dx * sin + dy * cos
		}));
		return { type: 'rect', cx, cy, corners };
	}

	/** AABB from hitbox corners */
	function hitboxAABB(hb: Hitbox): { minX: number; minY: number; maxX: number; maxY: number } {
		if (hb.type === 'circle') {
			return { minX: hb.cx - hb.r, minY: hb.cy - hb.r, maxX: hb.cx + hb.r, maxY: hb.cy + hb.r };
		}
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const p of hb.corners) {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		}
		return { minX, minY, maxX, maxY };
	}

	/** SAT overlap for two convex polygons */
	function polyOverlap(polyA: Point[], polyB: Point[]): boolean {
		function getAxes(poly: Point[]): Point[] {
			const axes: Point[] = [];
			for (let i = 0; i < poly.length; i++) {
				const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
				const ex = p2.x - p1.x, ey = p2.y - p1.y;
				const len = Math.sqrt(ex * ex + ey * ey);
				if (len > 0) axes.push({ x: -ey / len, y: ex / len });
			}
			return axes;
		}
		for (const ax of [...getAxes(polyA), ...getAxes(polyB)]) {
			let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
			for (const p of polyA) { const d = p.x * ax.x + p.y * ax.y; if (d < minA) minA = d; if (d > maxA) maxA = d; }
			for (const p of polyB) { const d = p.x * ax.x + p.y * ax.y; if (d < minB) minB = d; if (d > maxB) maxB = d; }
			if (maxA <= minB || maxB <= minA) return false;
		}
		return true;
	}

	/** Check overlap between two hitboxes */
	function hitboxesOverlap(a: Hitbox, b: Hitbox): boolean {
		// Quick AABB rejection
		const aa = hitboxAABB(a), bb = hitboxAABB(b);
		if (aa.maxX <= bb.minX || aa.minX >= bb.maxX || aa.maxY <= bb.minY || aa.minY >= bb.maxY) return false;
		// Circle vs circle
		if (a.type === 'circle' && b.type === 'circle') {
			const dx = a.cx - b.cx, dy = a.cy - b.cy;
			return dx * dx + dy * dy < (a.r + b.r) * (a.r + b.r);
		}
		// Rect vs rect — SAT on rotated corners
		if (a.type === 'rect' && b.type === 'rect') {
			return polyOverlap(a.corners, b.corners);
		}
		// Rect vs circle
		const rect = a.type === 'rect' ? a : b as Extract<Hitbox, { type: 'rect' }>;
		const circ = a.type === 'circle' ? a : b as Extract<Hitbox, { type: 'circle' }>;
		// Transform circle center into rect's local space and do AABB-circle test
		// But since rect is already rotated corners, use polygon-vs-circle: check distance from circle to each edge
		return circleIntersectsPoly(circ.cx, circ.cy, circ.r, rect.corners);
	}

	function circleIntersectsPoly(cx: number, cy: number, r: number, poly: Point[]): boolean {
		// Check if circle center is inside polygon
		if (pointInPoly({ x: cx, y: cy }, poly)) return true;
		// Check if circle intersects any edge
		for (let i = 0; i < poly.length; i++) {
			const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
			if (segDistSq(cx, cy, p1, p2) < r * r) return true;
		}
		return false;
	}

	function segDistSq(px: number, py: number, a: Point, b: Point): number {
		const dx = b.x - a.x, dy = b.y - a.y;
		const lenSq = dx * dx + dy * dy;
		if (lenSq === 0) { const ex = px - a.x, ey = py - a.y; return ex * ex + ey * ey; }
		const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
		const projX = a.x + t * dx, projY = a.y + t * dy;
		const ex = px - projX, ey = py - projY;
		return ex * ex + ey * ey;
	}

	/** Check if a hitbox overlaps with any wall edge */
	function hitboxCollidesWalls(hb: Hitbox): boolean {
		return walls.some(w => {
			if (w.points.length < 2) return false;
			const pts = w.points.map(p => ({ x: Number(p.x), y: Number(p.y) }));
			for (let i = 0; i < pts.length; i++) {
				const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
				if (segmentHitsHitbox(p1, p2, hb)) return true;
			}
			return false;
		});
	}

	function segmentHitsHitbox(p1: Point, p2: Point, hb: Hitbox): boolean {
		if (hb.type === 'circle') {
			return segDistSq(hb.cx, hb.cy, p1, p2) < hb.r * hb.r;
		}
		// Segment vs rotated rect: check if segment intersects any rect edge
		for (let i = 0; i < hb.corners.length; i++) {
			const c1 = hb.corners[i], c2 = hb.corners[(i + 1) % hb.corners.length];
			if (segmentsIntersect(p1, p2, c1, c2)) return true;
		}
		// Also check if segment is entirely inside rect
		if (pointInPoly(p1, hb.corners)) return true;
		return false;
	}

	function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
		const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
		const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
		const cross = d1x * d2y - d1y * d2x;
		if (Math.abs(cross) < 1e-10) return false;
		const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross;
		const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross;
		return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
	}

	function tableOutOfBounds(t: TableObj): boolean {
		if (!bounds) return false;
		const hb = tableHitbox(t);
		const ext = hitboxAABB(hb);
		const bx = Number(bounds.x), by = Number(bounds.y), bw = Number(bounds.w), bh = Number(bounds.h);
		return ext.minX < bx || ext.minY < by || ext.maxX > bx + bw || ext.maxY > by + bh;
	}

	/** Combined collision check */
	function tableHasCollision(candidate: TableObj, excludeId?: string, otherTables?: TableObj[]): boolean {
		const hb = tableHitbox(candidate);
		if (hitboxCollidesWalls(hb)) return true;
		if (tableOutOfBounds(candidate)) return true;
		const others = otherTables ?? tables;
		const filtered = excludeId ? others.filter(o => o.id !== excludeId) : others;
		return filtered.some(o => hitboxesOverlap(hb, tableHitbox(o)));
	}

	// Hit the table BODY only (used for initiating drag + collision)
	function tableBodyHit(t: TableObj, p: Point): boolean {
		if (t.shape === 'round') {
			const dx = p.x - Number(t.x), dy = p.y - Number(t.y);
			return Math.sqrt(dx * dx + dy * dy) <= Number(t.radius);
		}
		return pointInPoly(p, rotatedCorners(t));
	}

	// Returns chair index the point hits (-1 = none), point in world coords (circular hitbox)
	function findClickedChair(t: TableObj, p: Point): number {
		const a = -(Number(t.rotation) * Math.PI) / 180;
		const cos = Math.cos(a), sin = Math.sin(a);
		const dx = p.x - Number(t.x), dy = p.y - Number(t.y);
		const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
		const CR = 0.21;
		const chairs = localChairs(t);
		for (let i = 0; i < chairs.length; i++) {
			const cdx = lx - chairs[i].x, cdy = ly - chairs[i].y;
			if (Math.sqrt(cdx * cdx + cdy * cdy) <= CR) return i;
		}
		return -1;
	}

	// Full hit test (body + chairs) – used for eraser
	function tableHit(t: TableObj, p: Point): boolean {
		return tableBodyHit(t, p) || findClickedChair(t, p) >= 0;
	}

	// ─── Chair layout (local table space) ────────────────────────────────────
	type ChairPos = { x: number; y: number; rot: number };

	/** Total chair count from per-side values */
	function totalChairs(t: TableObj): number {
		if (t.shape === 'round') return Number(t.chairs) || 0;
		return (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) +
			(Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0);
	}

	function localChairs(t: TableObj): ChairPos[] {
		const CR = 0.21, TABLE_GAP = 0.06;
		const gap  = Math.max(0, Number(t.chairSpacing ?? 0.05));
		const step = 2 * CR + gap;

		if (t.shape === 'round') {
			const n = Number(t.chairs) || 0;
			if (n === 0) return [];
			const r = Number(t.radius) + TABLE_GAP + CR;
			return Array.from({ length: n }, (_, i) => {
				const a = (i / n) * 2 * Math.PI - Math.PI / 2;
				return { x: Math.cos(a) * r, y: Math.sin(a) * r, rot: (a * 180 / Math.PI) + 90 };
			});
		}

		const hw = Number(t.width) / 2, hh = Number(t.height) / 2;
		const topN = Number(t.chairsTop) || 0;
		const botN = Number(t.chairsBottom) || 0;
		const rightN = Number(t.chairsRight) || 0;
		const leftN = Number(t.chairsLeft) || 0;

		function sidePlacement(n: number, perp: number, horiz: boolean, rot: number): ChairPos[] {
			if (n <= 0) return [];
			const total = n * 2 * CR + (n - 1) * gap;
			const start = -total / 2 + CR;
			return Array.from({ length: n }, (_, i) => ({
				x: horiz ? start + i * step : perp,
				y: horiz ? perp : start + i * step,
				rot
			}));
		}

		return [
			...sidePlacement(topN,   -hh - TABLE_GAP - CR, true,  180),
			...sidePlacement(botN,    hh + TABLE_GAP + CR, true,  0),
			...sidePlacement(rightN,  hw + TABLE_GAP + CR, false, 270),
			...sidePlacement(leftN,  -hw - TABLE_GAP - CR, false, 90),
		];
	}

	// ─── Guest helpers ────────────────────────────────────────────────────────
	function addGuest() {
		const first = newFirst.trim(), last = newLast.trim();
		if (!first || !last) return;
		guests = [...guests, { id: crypto.randomUUID(), firstName: first, lastName: last, group: newGroup.trim() || undefined }];
		newFirst = ''; newLast = ''; newGroup = '';
	}

	function removeGuest(id: string) {
		guests = guests.filter(g => g.id !== id);
		// Clear from current floor
		tables = tables.map(t => ({ ...t, assignments: t.assignments.map(a => a === id ? null : a) }));
		// Clear from other floors
		floors = floors.map((f, i) => i === activeFloorIdx ? f : ({
			...f, tables: f.tables.map(t => ({ ...t, assignments: t.assignments.map(a => a === id ? null : a) }))
		}));
	}

	function assignGuest(guestId: string) {
		if (!chairPopover) return;
		const { tableId, chairIdx } = chairPopover;
		// Remove guest from ALL floors' tables first
		floors = floors.map((f, fi) => {
			const floorTables = fi === activeFloorIdx ? tables : f.tables;
			const updated = floorTables.map(t => {
				const a = [...t.assignments];
				for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
				return { ...t, assignments: a };
			});
			return fi === activeFloorIdx ? f : { ...f, tables: updated };
		});
		// Now assign on current floor
		tables = tables.map(t => {
			const a = [...t.assignments];
			for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
			if (t.id === tableId) a[chairIdx] = guestId;
			return { ...t, assignments: a };
		});
		chairPopover = null; guestSearch = '';
	}

	function clearChairAssignment() {
		if (!chairPopover) return;
		const { tableId, chairIdx } = chairPopover;
		tables = tables.map(t => {
			if (t.id !== tableId) return t;
			const a = [...t.assignments]; a[chairIdx] = null;
			return { ...t, assignments: a };
		});
		chairPopover = null;
	}

	/** Snapshot reactive tables to plain objects with Number() coercion */
	function snapTables(src: TableObj[]): TableObj[] {
		return src.map(t => ({
			...t, x: Number(t.x), y: Number(t.y), width: Number(t.width), height: Number(t.height),
			radius: Number(t.radius), chairs: Number(t.chairs), rotation: Number(t.rotation),
			chairsTop: Number(t.chairsTop) || 0, chairsBottom: Number(t.chairsBottom) || 0,
			chairsLeft: Number(t.chairsLeft) || 0, chairsRight: Number(t.chairsRight) || 0,
			chairSpacing: Number(t.chairSpacing), assignments: [...t.assignments]
		}));
	}

	// ─── Element snapping ────────────────────────────────────────────────────
	const SNAP_THRESHOLD = 0.3; // metres

	function elementSnap(pos: Point, excludeId?: string): { snapped: Point; guides: { axis: 'x' | 'y'; value: number }[] } {
		if (!snapToElements) return { snapped: pos, guides: [] };

		const targets: Point[] = [];
		// Table centers and edge midpoints
		for (const t of tables) {
			if (t.id === excludeId) continue;
			const cx = Number(t.x), cy = Number(t.y);
			targets.push({ x: cx, y: cy });
			if (t.shape === 'rect') {
				const corners = rotatedCorners(t);
				// Edge midpoints
				for (let i = 0; i < corners.length; i++) {
					const c1 = corners[i], c2 = corners[(i + 1) % corners.length];
					targets.push({ x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 });
				}
			} else {
				const r = Number(t.radius);
				targets.push({ x: cx, y: cy - r }, { x: cx, y: cy + r }, { x: cx - r, y: cy }, { x: cx + r, y: cy });
			}
		}
		// Wall vertices and edge midpoints
		for (const w of walls) {
			for (let i = 0; i < w.points.length; i++) {
				const p = w.points[i];
				targets.push({ x: Number(p.x), y: Number(p.y) });
				const p2 = w.points[(i + 1) % w.points.length];
				targets.push({ x: (Number(p.x) + Number(p2.x)) / 2, y: (Number(p.y) + Number(p2.y)) / 2 });
			}
		}

		let bestX = pos.x, bestDistX = SNAP_THRESHOLD + 1;
		let bestY = pos.y, bestDistY = SNAP_THRESHOLD + 1;
		const guides: { axis: 'x' | 'y'; value: number }[] = [];

		for (const t of targets) {
			const dx = Math.abs(pos.x - t.x);
			const dy = Math.abs(pos.y - t.y);
			if (dx < bestDistX) { bestDistX = dx; bestX = t.x; }
			if (dy < bestDistY) { bestDistY = dy; bestY = t.y; }
		}

		const result = { x: pos.x, y: pos.y };
		if (bestDistX <= SNAP_THRESHOLD) { result.x = bestX; guides.push({ axis: 'x', value: bestX }); }
		if (bestDistY <= SNAP_THRESHOLD) { result.y = bestY; guides.push({ axis: 'y', value: bestY }); }

		return { snapped: result, guides };
	}

	function clearAllAssignments() {
		tables = tables.map(t => ({ ...t, assignments: Array(totalChairs(t)).fill(null) }));
	}

	// Smart auto-seating: group by group field then by surname, seat groups together
	function autoAssign() {
		tables = tables.map(t => ({ ...t, assignments: Array(totalChairs(t)).fill(null) }));
		// Group guests
		const groups = new Map<string, Guest[]>();
		for (const g of guests) {
			const key = (g.group?.trim() || g.lastName.trim()).toLowerCase();
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(g);
		}
		// Sort groups: largest first, then alphabetical; sort members by first name
		const sortedGroups = [...groups.entries()]
			.sort(([ka, a], [kb, b]) => b.length - a.length || ka.localeCompare(kb))
			.map(([, g]) => [...g].sort((a, b) => a.firstName.localeCompare(b.firstName)));

		for (const group of sortedGroups) {
			// Find smallest table that fits whole group
			let bestIdx = -1, bestFree = Infinity;
			for (let i = 0; i < tables.length; i++) {
				const free = tables[i].assignments.filter(a => a === null).length;
				if (free >= group.length && free < bestFree) { bestFree = free; bestIdx = i; }
			}
			if (bestIdx !== -1) {
				let g = 0;
				tables = tables.map((t, i) => {
					if (i !== bestIdx) return t;
					const a = [...t.assignments];
					for (let j = 0; j < a.length && g < group.length; j++) if (a[j] === null) a[j] = group[g++].id;
					return { ...t, assignments: a };
				});
			} else {
				// Doesn't fit any single table – fill across tables by largest-free-first
				let remaining = [...group];
				while (remaining.length > 0) {
					let maxFree = 0, maxIdx = -1;
					for (let i = 0; i < tables.length; i++) {
						const free = tables[i].assignments.filter(a => a === null).length;
						if (free > maxFree) { maxFree = free; maxIdx = i; }
					}
					if (maxIdx === -1 || maxFree === 0) break;
					const batch = remaining.splice(0, maxFree);
					let g = 0;
					tables = tables.map((t, i) => {
						if (i !== maxIdx) return t;
						const a = [...t.assignments];
						for (let j = 0; j < a.length && g < batch.length; j++) if (a[j] === null) a[j] = batch[g++].id;
						return { ...t, assignments: a };
					});
				}
			}
		}
	}

	// ─── Derived ──────────────────────────────────────────────────────────────
	const selectedTable = $derived(tables.find(t => t.id === selectedId) ?? null);
	const selectedWall  = $derived(walls.find(w => w.id === selectedId) ?? null);
	const selectedZone  = $derived(zones.find(z => z.id === selectedId) ?? null);

	const ghostW = $derived(selectedType ? Number(selectedType.width) : tWidth);
	const ghostH = $derived(selectedType ? Number(selectedType.height) : tHeight);
	const ghostR = $derived(selectedType ? Number(selectedType.radius) : Math.max(tWidth, tHeight) / 2);
	const ghostShape = $derived(selectedType ? selectedType.shape : tShape);
	const ghostCh = $derived(selectedType ? Number(selectedType.max_chairs) : tChairs);

	function makeGhostTable(x: number, y: number): TableObj {
		return {
			id: '__ghost__', x, y, width: ghostW, height: ghostH,
			radius: ghostR, shape: ghostShape, chairs: ghostCh,
			chairsTop: tChairsTop, chairsBottom: tChairsBottom, chairsLeft: tChairsLeft, chairsRight: tChairsRight,
			rotation: 0, label: '', chairSpacing: tChairSpacing, assignments: []
		};
	}

	const ghostValid = $derived.by(() => {
		const ghost = makeGhostTable(cursorPos.x, cursorPos.y);
		const snap = snapTables(tables);
		return !tableHasCollision(ghost, undefined, snap);
	});

	const ghostChairs = $derived(localChairs(makeGhostTable(0, 0)));

	const assignedIds      = $derived(new Set([
		...tables.flatMap(t => t.assignments.filter(Boolean) as string[]),
		...floors.flatMap((f, i) => i === activeFloorIdx ? [] : f.tables.flatMap(t => t.assignments.filter(Boolean) as string[]))
	]));
	const totalAssigned    = $derived(assignedIds.size);
	const totalSeats       = $derived(tables.reduce((s, t) => s + totalChairs(t), 0));

	const popoverTable = $derived.by(() => {
		const cp = chairPopover;
		return cp ? tables.find(t => t.id === cp.tableId) ?? null : null;
	});
	const popoverChairGuest = $derived.by(() => {
		const cp = chairPopover, pt = popoverTable;
		if (!pt || !cp) return null;
		return guests.find(g => g.id === pt.assignments[cp.chairIdx]) ?? null;
	});
	const filteredPopoverGuests = $derived.by(() => {
		const cp = chairPopover, pt = popoverTable;
		return guests
			.filter(g => {
				const isCurrent = cp && pt ? pt.assignments[cp.chairIdx] === g.id : false;
				return isCurrent || !assignedIds.has(g.id);
			})
			.filter(g => !guestSearch ||
				`${g.firstName} ${g.lastName} ${g.group ?? ''}`.toLowerCase().includes(guestSearch.toLowerCase()))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
	});

	const patternX = $derived(((panX % zoom) + zoom) % zoom);
	const patternY = $derived(((panY % zoom) + zoom) % zoom);

	// Ruler tick computation
	const rulerStep  = $derived(gridSnap);
	const rulerMajor = $derived(gridSnap < 1 ? 1 : gridSnap);
	const rulerMinMx = $derived(Math.floor(-panX / zoom / rulerStep) * rulerStep);
	const rulerMaxMx = $derived(Math.ceil((4000 - panX) / zoom / rulerStep) * rulerStep);
	const rulerMinMy = $derived(Math.floor(-panY / zoom / rulerStep) * rulerStep);
	const rulerMaxMy = $derived(Math.ceil((4000 - panY) / zoom / rulerStep) * rulerStep);

	// ─── Event handlers ───────────────────────────────────────────────────────
	function onPointerMove(e: PointerEvent) {
		const raw = svgCoords(e);
		cursorPos = snap(raw);

		// Track mouse position for rulers
		const r = svgEl?.getBoundingClientRect();
		if (r) { rulerMouseX = e.clientX - r.left; rulerMouseY = e.clientY - r.top; }

		if (isPanning) { panX += e.movementX; panY += e.movementY; snapGuides = []; return; }

		// Vertex dragging (reshape polygon)
		if (isVertexDragging && selectedId) {
			const dx = raw.x - polyDragStart.x, dy = raw.y - polyDragStart.y;
			const newPos = snap({ x: vertexOrigPos.x + dx, y: vertexOrigPos.y + dy });
			const wall = walls.find(w => w.id === selectedId);
			if (wall) {
				const newPts = wall.points.map((p, i) => i === vertexDragIdx ? newPos : p);
				walls = walls.map(w => w.id === selectedId ? { ...w, points: newPts } : w);
			}
			const zone = zones.find(z => z.id === selectedId);
			if (zone) {
				const newPts = zone.points.map((p, i) => i === vertexDragIdx ? newPos : p);
				zones = zones.map(z => z.id === selectedId ? { ...z, points: newPts } : z);
			}
			return;
		}

		// Polygon body dragging (move entire wall/zone)
		if (isPolyDragging && selectedId) {
			const dx = raw.x - polyDragStart.x, dy = raw.y - polyDragStart.y;
			const snappedDelta = snap({ x: polyOrigPoints[0].x + dx, y: polyOrigPoints[0].y + dy });
			const actualDx = snappedDelta.x - polyOrigPoints[0].x;
			const actualDy = snappedDelta.y - polyOrigPoints[0].y;
			const newPts = polyOrigPoints.map(p => ({ x: p.x + actualDx, y: p.y + actualDy }));
			walls = walls.map(w => w.id === selectedId ? { ...w, points: newPts } : w);
			zones = zones.map(z => z.id === selectedId ? { ...z, points: newPts } : z);
			return;
		}

		if (isDragging && selectedId) {
			const dx = raw.x - dragStart.x, dy = raw.y - dragStart.y;
			const gridSnapped = snap({ x: elemStart.x + dx, y: elemStart.y + dy });
			const { snapped: elemSnapped, guides } = elementSnap(gridSnapped, selectedId);
			snapGuides = guides;
			const current = snapTables(tables);
			const orig = current.find(t => t.id === selectedId);
			if (orig) {
				const candidate: TableObj = { ...orig, x: elemSnapped.x, y: elemSnapped.y };
				if (!tableHasCollision(candidate, selectedId, current)) {
					tables = tables.map(t => t.id === selectedId ? candidate : t);
				}
			}
		} else {
			snapGuides = [];
		}

		if (isRotating && selectedId) {
			const raw2 = svgCoords(e);
			const a = Math.atan2(raw2.y - rotCenter.y, raw2.x - rotCenter.x) * 180 / Math.PI;
			const newRot = Math.round((rotStartDeg + a - rotStartAngle) / 5) * 5;
			const current = snapTables(tables);
			const orig = current.find(t => t.id === selectedId);
			if (orig) {
				const candidate: TableObj = { ...orig, rotation: newRot };
				if (!tableHasCollision(candidate, selectedId, current)) {
					tables = tables.map(t => t.id === selectedId ? candidate : t);
				}
			}
		}
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			e.preventDefault(); isPanning = true; svgEl.setPointerCapture(e.pointerId); return;
		}
		if (e.button !== 0) return;
		// Close any open popover on canvas click
		if (chairPopover) { chairPopover = null; guestSearch = ''; return; }

		const raw = svgCoords(e), pos = snap(raw);

		if (tool === 'wall' || tool === 'zone') {
			if (!isDrawing) { isDrawing = true; drawPts = [pos]; return; }
			const first = drawPts[0];
			if (drawPts.length >= 3 && Math.hypot(pos.x - first.x, pos.y - first.y) < gridSnap * 1.5) {
				finishDrawing();
			} else { drawPts = [...drawPts, pos]; }
			return;
		}

		if (tool === 'measure') {
			if (!measureStart) {
				measureStart = pos;
				measureEnd = null;
			} else if (!measureEnd) {
				measureEnd = pos;
			} else {
				measureStart = pos;
				measureEnd = null;
			}
			return;
		}

		if (tool === 'table') {
			pushUndo();
			const st = selectedType;
			const useShape = st ? st.shape : tShape;
			const useWidth = st ? Number(st.width) : tWidth;
			const useHeight = st ? Number(st.height) : tHeight;
			const useRadius = st ? Number(st.radius) : Math.max(tWidth, tHeight) / 2;
			const useChairs = st ? Number(st.max_chairs) : tChairs;
			const t: TableObj = {
				id: crypto.randomUUID(), x: pos.x, y: pos.y,
				width: useWidth, height: useHeight, radius: useRadius,
				shape: useShape, chairs: useChairs, rotation: 0,
				label: st ? st.name : `T${tables.length + 1}`,
				chairsTop: tChairsTop, chairsBottom: tChairsBottom,
				chairsLeft: tChairsLeft, chairsRight: tChairsRight,
				chairSpacing: tChairSpacing,
				assignments: Array(useShape === 'round' ? useChairs : (tChairsTop + tChairsBottom + tChairsLeft + tChairsRight)).fill(null),
				typeId: st?.id,
			};
			const snap = snapTables(tables);
			if (!tableHasCollision(t, undefined, snap)) { tables = [...tables, t]; selectedId = t.id; tool = 'select'; }
			return;
		}

		if (tool === 'eraser') {
			for (let i = tables.length - 1; i >= 0; i--) {
				if (tableHit(tables[i], raw)) { pushUndo(); tables = tables.filter((_, j) => j !== i); return; }
			}
			if (!protectWallsZones) {
				for (let i = zones.length - 1; i >= 0; i--) {
					if (pointInPoly(raw, zones[i].points)) { pushUndo(); zones = zones.filter((_, j) => j !== i); return; }
				}
				for (let i = walls.length - 1; i >= 0; i--) {
					if (pointInPoly(raw, walls[i].points)) { pushUndo(); walls = walls.filter((_, j) => j !== i); return; }
				}
			}
			return;
		}

		if (tool === 'bounds') {
			if (!boundsStart) {
				boundsStart = pos;
			} else {
				const x = Math.min(boundsStart.x, pos.x);
				const y = Math.min(boundsStart.y, pos.y);
				const w = Math.abs(pos.x - boundsStart.x);
				const h = Math.abs(pos.y - boundsStart.y);
				if (w > 0.5 && h > 0.5) {
					pushUndo();
					bounds = { x, y, w, h };
				}
				boundsStart = null;
				tool = 'select';
			}
			return;
		}

		if (tool === 'select') {
			// Check vertex handles on selected wall/zone first
			if (selectedId && !protectWallsZones) {
				const selWall = walls.find(w => w.id === selectedId);
				const selZone = zones.find(z => z.id === selectedId);
				const pts = selWall?.points ?? selZone?.points;
				if (pts) {
					const hitR = 8 / zoom; // vertex handle radius in world coords
					for (let vi = 0; vi < pts.length; vi++) {
						if (Math.hypot(raw.x - pts[vi].x, raw.y - pts[vi].y) < hitR) {
							pushUndo();
							isVertexDragging = true;
							vertexDragIdx = vi;
							polyDragStart = raw;
							vertexOrigPos = { ...pts[vi] };
							svgEl.setPointerCapture(e.pointerId);
							return;
						}
					}
				}
			}

			for (let i = tables.length - 1; i >= 0; i--) {
				const t = tables[i];
				// Check chair click first (opens popover, no drag)
				const ci = findClickedChair(t, raw);
				if (ci >= 0) {
					selectedId = t.id;
					const r = svgEl.getBoundingClientRect();
					chairPopover = { tableId: t.id, chairIdx: ci, x: e.clientX - r.left, y: e.clientY - r.top };
					guestSearch = '';
					return;
				}
				// Then table body (drag)
				if (tableBodyHit(t, raw)) {
					pushUndo(); selectedId = t.id; isDragging = true; dragStart = raw; elemStart = { x: t.x, y: t.y }; return;
				}
			}
			// Zones — select + drag
			if (!protectWallsZones) {
				for (let i = zones.length - 1; i >= 0; i--) {
					if (pointInPoly(raw, zones[i].points)) {
						pushUndo(); selectedId = zones[i].id;
						isPolyDragging = true; polyDragStart = raw;
						polyOrigPoints = zones[i].points.map(p => ({ ...p }));
						svgEl.setPointerCapture(e.pointerId);
						return;
					}
				}
			}
			// Walls — select + drag
			if (!protectWallsZones) {
				for (let i = walls.length - 1; i >= 0; i--) {
					if (pointInPoly(raw, walls[i].points)) {
						pushUndo(); selectedId = walls[i].id;
						isPolyDragging = true; polyDragStart = raw;
						polyOrigPoints = walls[i].points.map(p => ({ ...p }));
						svgEl.setPointerCapture(e.pointerId);
						return;
					}
				}
			}
			selectedId = null;
		}
	}

	function onPointerUp(e: PointerEvent) {
		isPanning = isDragging = isRotating = isPolyDragging = isVertexDragging = false;
		vertexDragIdx = -1;
		svgEl?.releasePointerCapture(e.pointerId);
	}

	function onDblClick(e: MouseEvent) {
		if ((tool === 'wall' || tool === 'zone') && isDrawing && drawPts.length >= 3) finishDrawing();
	}

	function finishDrawing() {
		pushUndo();
		if (tool === 'wall') walls = [...walls, { id: crypto.randomUUID(), points: [...drawPts] }];
		else zones = [...zones, { id: crypto.randomUUID(), points: [...drawPts], color: zoneColor, label: `Zone ${zones.length + 1}` }];
		drawPts = []; isDrawing = false;
	}

	function cancelDrawing() { drawPts = []; isDrawing = false; }

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const r = svgEl.getBoundingClientRect();
		const cx = e.clientX - r.left, cy = e.clientY - r.top;
		const nz = Math.min(200, Math.max(15, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
		panX = cx - (cx - panX) * (nz / zoom); panY = cy - (cy - panY) * (nz / zoom); zoom = nz;
	}

	function startRotate(e: PointerEvent, t: TableObj) {
		e.stopPropagation(); pushUndo(); isRotating = true; rotCenter = { x: t.x, y: t.y };
		const raw = svgCoords(e);
		rotStartAngle = Math.atan2(raw.y - t.y, raw.x - t.x) * 180 / Math.PI; rotStartDeg = t.rotation;
		svgEl.setPointerCapture(e.pointerId);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
			if (measureStart || measureEnd) { measureStart = null; measureEnd = null; return; }
			if (boundsStart) { boundsStart = null; return; }
			if (isDrawing) cancelDrawing(); else selectedId = null;
		}
		if (e.key === 'Enter' && isDrawing && drawPts.length >= 3) finishDrawing();
		if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !isDrawing && !chairPopover) {
			pushUndo();
			tables = tables.filter(t => t.id !== selectedId);
			walls  = walls.filter(w => w.id !== selectedId);
			zones  = zones.filter(z => z.id !== selectedId);
			selectedId = null;
		}
		// Undo / Redo
		if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
	}

	// ─── Props panel helpers ──────────────────────────────────────────────────
	function updateTable(patch: Partial<TableObj>) {
		tables = tables.map(t => {
			if (t.id !== selectedId) return t;
			const u = { ...t, ...patch };
			// Enforce max_chairs from inventory type
			const tt = u.typeId ? tableTypes?.find(x => x.id === u.typeId) : null;
			if (tt) {
				const max = Number(tt.max_chairs);
				if (u.shape === 'round') {
					u.chairs = Math.min(Number(u.chairs) || 0, max);
				} else {
					let total = (Number(u.chairsTop) || 0) + (Number(u.chairsBottom) || 0) +
						(Number(u.chairsLeft) || 0) + (Number(u.chairsRight) || 0);
					if (total > max) {
						// Clamp the field that was just changed
						const changed = Object.keys(patch).find(k => k.startsWith('chairs')) as keyof TableObj | undefined;
						if (changed && changed in u) {
							(u as Record<string, unknown>)[changed] = Math.max(0, (Number((u as Record<string, unknown>)[changed]) || 0) - (total - max));
						}
					}
				}
			}
			// Resize assignments when chair count changes
			const newTotal = totalChairs(u);
			if (newTotal !== t.assignments.length)
				u.assignments = Array.from({ length: newTotal }, (_, i) => t.assignments[i] ?? null);
			return u;
		});
	}
	function updateZone(patch: Partial<ZoneObj>) {
		zones = zones.map(z => z.id === selectedId ? { ...z, ...patch } : z);
	}

	// ─── Constants ────────────────────────────────────────────────────────────
	const ZONE_PRESETS = ['#a78bfa','#22d3ee','#34d399','#fb923c','#f472b6','#facc15','#60a5fa','#f87171'];

	const TOOL_LABELS: Record<Tool, string> = {
		select: 'Grab', wall: 'Wall painter', zone: 'Zone painter', table: 'Place table', eraser: 'Eraser',
		bounds: 'Bounds', measure: 'Measure',
	};
	const ICONS: Record<Tool, string> = {
		select: 'M5 3l14 9-7 1.5L9 20z',
		wall:   'M3 5h18M3 12h18M3 19h18',
		zone:   'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z',
		table:  'M3 6h18M3 18h18M8 6v12M16 6v12',
		eraser: 'M20 20H7L3 16l11-11 6 6M6 17l-3-3',
		bounds: 'M3 3h18v18H3zM7 3v18M3 7h18',
		measure: 'M2 2l20 20M2 8V2h6M22 16v6h-6',
	};

	function closeSnapDrop(e: MouseEvent) {
		if (!(e.target as HTMLElement).closest('.custom-select')) snapDropOpen = false;
	}

	onMount(() => {
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('click', closeSnapDrop, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('click', closeSnapDrop, true);
		};
	});
</script>

<!-- ─── Layout ─────────────────────────────────────────────────────────────── -->
<div class="app">
	<!-- Header -->
	<header>
		<div class="header-controls">
			<div class="ctrl">
				<label for="zoom-sl">Zoom</label>
				<input id="zoom-sl" type="range" min="15" max="200" bind:value={zoom} style="width:90px"/>
				<span class="val">{Math.round(zoom)} px/m</span>
			</div>
			<div class="ctrl">
				<label>Snap</label>
				<div class="custom-select" role="listbox" tabindex="0"
					onclick={(e) => { e.stopPropagation(); snapDropOpen = !snapDropOpen; }}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); snapDropOpen = !snapDropOpen; } }}>
					<span class="custom-select-value">{gridSnap} m</span>
					<svg class="custom-select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
					{#if snapDropOpen}
						<div class="custom-select-dropdown">
							{#each [0.25, 0.5, 1, 2] as val}
								<button class="custom-select-option" class:selected={gridSnap === val}
									onclick={(e) => { e.stopPropagation(); gridSnap = val; snapDropOpen = false; }}>
									{val} m
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<button class="snap-toggle" class:active={snapToElements}
				onclick={() => snapToElements = !snapToElements}
				title={snapToElements ? 'Element snapping ON' : 'Element snapping OFF'}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
					stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M6 2v4M6 18v4M18 2v4M18 18v4M2 6h4M18 6h4M2 18h4M18 18h4"/>
					<rect x="6" y="6" width="12" height="12" rx="1"/>
				</svg>
				Snap
			</button>
			<span class="hint-text">Alt+drag or middle-click to pan · Scroll = zoom</span>

			<!-- Floor tabs -->
			<div class="floor-tabs">
				{#each floors as floor, i}
					<button class="floor-tab" class:active={i === activeFloorIdx}
						onclick={() => { if (i !== activeFloorIdx) loadFloor(i); }}
						ondblclick={() => renameFloor(i)}>
						{floor.name}
					</button>
				{/each}
				<button class="floor-tab floor-tab-add" onclick={addFloor} title="Add floor">+</button>
				{#if floors.length > 1}
					<button class="floor-tab floor-tab-del" onclick={() => removeFloor(activeFloorIdx)} title="Remove current floor">✕</button>
				{/if}
			</div>
		</div>
	</header>

	<div class="body">
		<!-- Left toolbar -->
		<nav class="toolbar">
			{#each (['select','wall','zone','table','eraser','bounds','measure'] as Tool[]) as t}
				{#if !hiddenTools.includes(t)}
					<button class="tool-btn" class:active={tool === t}
						onclick={() => { tool = t; if (t !== 'select') selectedId = null; if (t !== 'wall' && t !== 'zone') cancelDrawing(); if (t !== 'bounds') boundsStart = null; }}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
							stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d={ICONS[t]}/>
						</svg>
						{TOOL_LABELS[t]}
					</button>
				{/if}
			{/each}

			<div class="sep"></div>

			<!-- Undo / Redo -->
			<button class="tool-btn" onclick={undo} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
					stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/>
				</svg>
				Undo
			</button>
			<button class="tool-btn" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
					stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-5.64-8.36L23 10"/>
				</svg>
				Redo
			</button>

			{#if isDrawing}
				<div class="sep"></div>
				<button class="tool-btn finish" onclick={finishDrawing}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
						<polyline points="20 6 9 17 4 12"/>
					</svg>
					Close shape
				</button>
				<button class="tool-btn cancel" onclick={cancelDrawing}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
						<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
					Cancel
				</button>
			{/if}
		</nav>

		<!-- Canvas -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<main class="canvas-wrap" role="application">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg bind:this={svgEl} class="map-svg"
				class:c-cross={tool === 'wall' || tool === 'zone' || tool === 'table' || tool === 'bounds' || tool === 'measure'}
				class:c-cell={tool === 'eraser'}
				onpointermove={onPointerMove} onpointerdown={onPointerDown}
				onpointerup={onPointerUp} ondblclick={onDblClick} onwheel={onWheel}
				style="touch-action:none">
				<defs>
					<pattern id="sg" width={ws(gridSnap)} height={ws(gridSnap)} patternUnits="userSpaceOnUse">
						<path d={`M ${ws(gridSnap)} 0 L 0 0 0 ${ws(gridSnap)}`}
							fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="0.5"/>
					</pattern>
					<pattern id="mg" width={zoom} height={zoom} patternUnits="userSpaceOnUse"
						x={patternX} y={patternY}>
						<rect width={zoom} height={zoom} fill="url(#sg)"/>
						<path d={`M ${zoom} 0 L 0 0 0 ${zoom}`}
							fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>
					</pattern>
				</defs>

				<!-- Floor -->
				<rect width="100%" height="100%" fill="#f8f9fc"/>
				<rect width="100%" height="100%" fill="url(#mg)"/>

				<!-- ── Ghost outline of floor below ── -->
				{#if activeFloorIdx > 0}
					{@const below = floors[activeFloorIdx - 1]}
					<!-- Ghost bounds -->
					{#if below.bounds}
						<rect x={wx(below.bounds.x)} y={wy(below.bounds.y)}
							width={ws(below.bounds.w)} height={ws(below.bounds.h)}
							fill="none" stroke="rgba(43,52,98,0.15)" stroke-width="1.5" stroke-dasharray="6,4"
							pointer-events="none"/>
					{/if}
					<!-- Ghost zones -->
					{#each below.zones as zone}
						<polygon points={zone.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
							fill={zone.color} fill-opacity="0.06" stroke={zone.color} stroke-opacity="0.15"
							stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
					{/each}
					<!-- Ghost walls -->
					{#each below.walls as wall}
						<polygon points={wall.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
							fill="rgba(43,52,98,0.06)" stroke="rgba(43,52,98,0.15)"
							stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
					{/each}
				{/if}

				<!-- ── Bounds mask (darken area outside) ── -->
				{#if bounds}
					<defs>
						<mask id="bounds-mask">
							<rect width="100%" height="100%" fill="white"/>
							<rect x={wx(bounds.x)} y={wy(bounds.y)}
								width={ws(bounds.w)} height={ws(bounds.h)} fill="black"/>
						</mask>
					</defs>
					<rect width="100%" height="100%" fill="rgba(30,37,71,0.35)" mask="url(#bounds-mask)"/>
					<rect x={wx(bounds.x)} y={wy(bounds.y)}
						width={ws(bounds.w)} height={ws(bounds.h)}
						fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="8,4"
						pointer-events="none"/>
				{/if}

				<!-- ── Bounds drawing preview ── -->
				{#if boundsStart}
					{@const bx = Math.min(boundsStart.x, cursorPos.x)}
					{@const by = Math.min(boundsStart.y, cursorPos.y)}
					{@const bw = Math.abs(cursorPos.x - boundsStart.x)}
					{@const bh = Math.abs(cursorPos.y - boundsStart.y)}
					<rect x={wx(bx)} y={wy(by)} width={ws(bw)} height={ws(bh)}
						fill="rgba(59,130,246,0.1)" stroke="#3b82f6" stroke-width="2"
						stroke-dasharray="6,3" pointer-events="none"/>
				{/if}

				<!-- ── Zones ── -->
				{#each zones as zone}
					{@const pts = zone.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
					{@const sel = zone.id === selectedId}
					<polygon points={pts} fill={zone.color} fill-opacity={sel ? 0.5 : 0.28}
						stroke={zone.color} stroke-width={sel ? 2.5 : 1.5} stroke-opacity="0.7"
						style={tool === 'select' && !protectWallsZones ? 'cursor:move' : ''}
						pointer-events={tool === 'select' || tool === 'eraser' ? 'auto' : 'none'}/>
					{@const cx = zone.points.reduce((s,p)=>s+p.x,0)/zone.points.length}
					{@const cy = zone.points.reduce((s,p)=>s+p.y,0)/zone.points.length}
					<text x={wx(cx)} y={wy(cy)} text-anchor="middle" dominant-baseline="middle"
						font-size="12" font-weight="600" fill={zone.color} pointer-events="none"
						style="paint-order:stroke" stroke="rgba(255,255,255,0.7)" stroke-width="3">
						{zone.label}
					</text>
					{#if sel && !protectWallsZones}
						{#each zone.points as p, vi}
							<circle cx={wx(p.x)} cy={wy(p.y)} r="6"
								fill={vertexDragIdx === vi && isVertexDragging ? zone.color : 'white'}
								stroke={zone.color} stroke-width="2" style="cursor:grab"
								pointer-events="auto"/>
						{/each}
					{/if}
				{/each}

				<!-- ── Walls ── -->
				{#each walls as wall}
					{@const pts = wall.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
					{@const sel = wall.id === selectedId}
					<polygon points={pts} fill="#2b3462" stroke={sel ? '#7b6cf0' : 'none'}
						stroke-width={sel ? 3 : 0}
						style={tool === 'select' && !protectWallsZones ? 'cursor:move' : ''}
						pointer-events={tool === 'select' || tool === 'eraser' ? 'auto' : 'none'}/>
					{#if sel && !protectWallsZones}
						{#each wall.points as p, vi}
							<circle cx={wx(p.x)} cy={wy(p.y)} r="6"
								fill={vertexDragIdx === vi && isVertexDragging ? '#5b4cd0' : '#7b6cf0'}
								stroke="white" stroke-width="2" style="cursor:grab"
								pointer-events="auto"/>
						{/each}
					{/if}
				{/each}

				<!-- ── Tables ── -->
				{#each tables as table}
					{@const chairs = localChairs(table)}
					{@const sel = table.id === selectedId}
					{@const rotH  = table.shape === 'rect' ? table.height/2 : table.radius}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g transform={`translate(${wx(table.x)},${wy(table.y)}) rotate(${table.rotation})`}
						class="table-g"
						onpointerdown={(e) => {
							if (e.button !== 0) return;
							e.stopPropagation();
							if (tool === 'eraser') { tables = tables.filter(t => t.id !== table.id); return; }
							if (tool === 'select') {
								selectedId = table.id; isDragging = true;
								dragStart = svgCoords(e); elemStart = { x: table.x, y: table.y };
							}
						}}>

						<!-- Table body (rendered first so chairs appear on top) -->
						{#if table.shape === 'rect'}
							<rect x={-ws(table.width/2)} y={-ws(table.height/2)}
								width={ws(table.width)} height={ws(table.height)} rx={ws(0.06)}
								fill="#92400e" stroke={sel ? '#7b6cf0' : '#78350f'}
								stroke-width={sel ? 3 : 1.5}/>
						{:else}
							<circle cx={0} cy={0} r={ws(table.radius)}
								fill="#92400e" stroke={sel ? '#7b6cf0' : '#78350f'}
								stroke-width={sel ? 3 : 1.5}/>
						{/if}

						<!-- Label -->
						<text x={0} y={ws(0.1)} text-anchor="middle" dominant-baseline="middle"
							font-size={Math.max(8,Math.min(ws(0.28),18))}
							font-family="system-ui,sans-serif" font-weight="700"
							fill="rgba(255,250,240,0.95)" pointer-events="none">
							{table.label}
						</text>

						<!-- Chairs (on top of table body) -->
						{#each chairs as ch, ci}
							{@const gId = table.assignments[ci] ?? null}
							{@const g   = gId ? guests.find(x => x.id === gId) : null}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<g transform={`translate(${ws(ch.x)},${ws(ch.y)}) rotate(${ch.rot})`}
								style="cursor:{tool==='select'?'pointer':'inherit'}"
								onpointerdown={(e) => {
									if (e.button !== 0 || tool !== 'select') return;
									e.stopPropagation();
									selectedId = table.id;
									const r = svgEl.getBoundingClientRect();
									chairPopover = { tableId: table.id, chairIdx: ci, x: e.clientX-r.left, y: e.clientY-r.top };
									guestSearch = '';
								}}>
								<!-- Chair back bar -->
								<rect x={-ws(0.21)} y={-ws(0.21)} width={ws(0.42)} height={ws(0.09)}
									rx={ws(0.04)} fill={g ? '#15803d' : '#78350f'}/>
								<!-- Chair seat -->
								<rect x={-ws(0.21)} y={-ws(0.12)} width={ws(0.42)} height={ws(0.33)}
									rx={ws(0.05)} fill={g ? '#16a34a' : '#a16207'}
									stroke={g ? '#14532d' : '#78350f'} stroke-width="1"/>
								<!-- Initials (only if assigned + zoomed in enough) -->
								{#if g && zoom >= 55}
									<text x={0} y={ws(0.09)} text-anchor="middle" dominant-baseline="middle"
										font-size={Math.max(6, ws(0.18))} font-weight="800"
										fill="white" pointer-events="none">
										{g.firstName[0]}{g.lastName[0]}
									</text>
								{/if}
							</g>
						{/each}

						<!-- Rotation handle -->
						{#if sel}
							<line x1={0} y1={-ws(rotH)} x2={0} y2={-ws(rotH+0.65)}
								stroke="#7b6cf0" stroke-width="1.5" stroke-dasharray="3,2" pointer-events="none"/>
							<circle cx={0} cy={-ws(rotH+0.65)} r={6}
								fill="#7b6cf0" stroke="white" stroke-width="2"
								style="cursor:grab"
								onpointerdown={(e) => startRotate(e, table)}/>
						{/if}
					</g>
				{/each}

				<!-- ── Drawing preview ── -->
				{#if isDrawing && drawPts.length > 0}
					{#if drawPts.length >= 2}
						<polygon points={[...drawPts,cursorPos].map(p=>`${wx(p.x)},${wy(p.y)}`).join(' ')}
							fill={tool==='wall' ? 'rgba(43,52,98,0.25)' : `${zoneColor}40`} stroke="none" pointer-events="none"/>
					{/if}
					<polyline points={drawPts.map(p=>`${wx(p.x)},${wy(p.y)}`).join(' ')}
						fill="none" stroke={tool==='wall'?'#2b3462':zoneColor}
						stroke-width="2" stroke-dasharray={tool==='zone'?'6,3':'none'} pointer-events="none"/>
					<line x1={wx(drawPts[drawPts.length-1].x)} y1={wy(drawPts[drawPts.length-1].y)}
						x2={wx(cursorPos.x)} y2={wy(cursorPos.y)}
						stroke={tool==='wall'?'#2b3462':zoneColor} stroke-width="1.5"
						stroke-dasharray="4,3" opacity="0.6" pointer-events="none"/>
					{#each drawPts as p, i}
						{@const near = i===0 && drawPts.length>=3 && Math.hypot(cursorPos.x-p.x,cursorPos.y-p.y)<gridSnap*1.5}
						<circle cx={wx(p.x)} cy={wy(p.y)} r={i===0?(near?9:6):4}
							fill={near?'#16a34a':(tool==='wall'?'#2b3462':zoneColor)}
							stroke="white" stroke-width="1.5" pointer-events="none"/>
					{/each}
				{/if}

				<!-- ── Table ghost ── -->
				{#if tool === 'table'}
					<g transform={`translate(${wx(cursorPos.x)},${wy(cursorPos.y)})`} opacity="0.65" pointer-events="none">
						{#if ghostShape === 'rect'}
							<rect x={-ws(ghostW/2)} y={-ws(ghostH/2)} width={ws(ghostW)} height={ws(ghostH)}
								rx={ws(0.06)} fill={ghostValid?'#92400e':'#7f1d1d'}
								stroke={ghostValid?'#f59e0b':'#ef4444'} stroke-width="2" stroke-dasharray="5,3"/>
						{:else}
							<circle cx={0} cy={0} r={ws(ghostR)}
								fill={ghostValid?'#92400e':'#7f1d1d'}
								stroke={ghostValid?'#f59e0b':'#ef4444'} stroke-width="2" stroke-dasharray="5,3"/>
						{/if}
						{#each ghostChairs as ch}
							<rect x={ws(ch.x-0.21)} y={ws(ch.y-0.21)} width={ws(0.42)} height={ws(0.42)}
								rx={ws(0.05)} fill={ghostValid?'#a16207':'#991b1b'} opacity="0.7"/>
						{/each}
					</g>
				{/if}

				<!-- ── Cursor guidelines (full canvas hairlines) ── -->
				{#if tool !== 'select' && tool !== 'eraser'}
					<line x1={0} y1={wy(cursorPos.y)} x2="100%" y2={wy(cursorPos.y)}
						stroke="rgba(123,108,240,0.25)" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
					<line x1={wx(cursorPos.x)} y1={0} x2={wx(cursorPos.x)} y2="100%"
						stroke="rgba(123,108,240,0.25)" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
				{/if}

				<!-- ── Snap guides ── -->
				{#each snapGuides as guide}
					{#if guide.axis === 'x'}
						<line x1={wx(guide.value)} y1={0} x2={wx(guide.value)} y2="100%"
							stroke="#22d3ee" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
					{:else}
						<line x1={0} y1={wy(guide.value)} x2="100%" y2={wy(guide.value)}
							stroke="#22d3ee" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
					{/if}
				{/each}

				<!-- ── Measure tool ── -->
				{#if measureStart && !measureEnd && tool === 'measure'}
					<line x1={wx(measureStart.x)} y1={wy(measureStart.y)}
						x2={wx(cursorPos.x)} y2={wy(cursorPos.y)}
						stroke="var(--accent)" stroke-width="2" stroke-dasharray="6,3" pointer-events="none"/>
					<circle cx={wx(measureStart.x)} cy={wy(measureStart.y)} r="4"
						fill="var(--accent)" pointer-events="none"/>
					{@const dist = Math.hypot(cursorPos.x - measureStart.x, cursorPos.y - measureStart.y)}
					{@const mx = (wx(measureStart.x) + wx(cursorPos.x)) / 2}
					{@const my = (wy(measureStart.y) + wy(cursorPos.y)) / 2}
					<rect x={mx - 28} y={my - 10} width="56" height="20" rx="4"
						fill="white" stroke="var(--accent)" stroke-width="1" pointer-events="none"/>
					<text x={mx} y={my + 4} text-anchor="middle" font-size="11" font-weight="600"
						fill="var(--accent)" font-family="monospace" pointer-events="none">{dist.toFixed(2)}m</text>
				{/if}
				{#if measureStart && measureEnd}
					<line x1={wx(measureStart.x)} y1={wy(measureStart.y)}
						x2={wx(measureEnd.x)} y2={wy(measureEnd.y)}
						stroke="var(--accent)" stroke-width="2" pointer-events="none"/>
					<circle cx={wx(measureStart.x)} cy={wy(measureStart.y)} r="4"
						fill="var(--accent)" pointer-events="none"/>
					<circle cx={wx(measureEnd.x)} cy={wy(measureEnd.y)} r="4"
						fill="var(--accent)" pointer-events="none"/>
					{@const dist = Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y)}
					{@const mx = (wx(measureStart.x) + wx(measureEnd.x)) / 2}
					{@const my = (wy(measureStart.y) + wy(measureEnd.y)) / 2}
					<rect x={mx - 28} y={my - 10} width="56" height="20" rx="4"
						fill="white" stroke="var(--accent)" stroke-width="1" pointer-events="none"/>
					<text x={mx} y={my + 4} text-anchor="middle" font-size="11" font-weight="600"
						fill="var(--accent)" font-family="monospace" pointer-events="none">{dist.toFixed(2)}m</text>
				{/if}
			</svg>

			<!-- ── Edge rulers ── -->
			<div class="ruler-corner"></div>
			<div class="ruler-top">
				{#each { length: Math.max(0, Math.round((rulerMaxMx - rulerMinMx) / rulerStep) + 1) } as _, i}
					{@const m = rulerMinMx + i * rulerStep}
					{@const px = m * zoom + panX - 20}
					{@const isMajor = Math.abs(m - Math.round(m / rulerMajor) * rulerMajor) < 0.001}
					{#if px >= 0 && px < 4000}
						{#if isMajor}
							<div class="ruler-tick ruler-tick-major" style="left:{px}px">
								<span class="ruler-label">{Math.round(m)}</span>
							</div>
						{:else}
							<div class="ruler-tick ruler-tick-minor" style="left:{px}px"></div>
						{/if}
					{/if}
				{/each}
				<div class="ruler-cursor-h" style="left:{rulerMouseX - 20}px"></div>
			</div>
			<div class="ruler-left">
				{#each { length: Math.max(0, Math.round((rulerMaxMy - rulerMinMy) / rulerStep) + 1) } as _, i}
					{@const m = rulerMinMy + i * rulerStep}
					{@const py = m * zoom + panY - 20}
					{@const isMajor = Math.abs(m - Math.round(m / rulerMajor) * rulerMajor) < 0.001}
					{#if py >= 0 && py < 4000}
						{#if isMajor}
							<div class="ruler-tick-v ruler-tick-major-v" style="top:{py}px">
								<span class="ruler-label-v">{Math.round(m)}</span>
							</div>
						{:else}
							<div class="ruler-tick-v ruler-tick-minor-v" style="top:{py}px"></div>
						{/if}
					{/if}
				{/each}
				<div class="ruler-cursor-v" style="top:{rulerMouseY - 20}px"></div>
			</div>

			<!-- Chair assignment popover -->
			{#if chairPopover}
				<div class="overlay" role="presentation"
					onclick={() => { chairPopover = null; guestSearch = ''; }}
					onkeydown={(e) => e.key==='Escape' && (chairPopover = null)}></div>
				<div class="chair-popover"
					style="left:{Math.min(chairPopover.x+12, 9999)}px; top:{Math.min(chairPopover.y-8, 9999)}px">
					<div class="pop-header">
						<span>
							{#if popoverTable}
								{popoverTable.label} · seat {chairPopover.chairIdx + 1}
							{/if}
						</span>
						<button class="pop-close" onclick={() => { chairPopover = null; guestSearch = ''; }}>✕</button>
					</div>
					{#if popoverChairGuest}
						<div class="pop-assigned">
							<span class="pop-name">{popoverChairGuest.firstName} {popoverChairGuest.lastName}</span>
							{#if popoverChairGuest.group}<span class="pop-group">{popoverChairGuest.group}</span>{/if}
							<button class="pop-clear" onclick={clearChairAssignment}>Remove</button>
						</div>
					{:else}
						<div class="pop-empty">Unassigned</div>
					{/if}
					<input class="pop-search" type="text" placeholder="Search guests…" bind:value={guestSearch} />
					<div class="pop-list">
						{#each filteredPopoverGuests as g}
							{@const isCurrent = popoverTable?.assignments[chairPopover.chairIdx] === g.id}
							<button class="pop-guest" class:current={isCurrent}
								onclick={() => isCurrent ? clearChairAssignment() : assignGuest(g.id)}>
								<span class="pop-gname">{g.lastName}, {g.firstName}</span>
								{#if g.group}<span class="pop-ggroup">{g.group}</span>{/if}
								{#if isCurrent}<span class="pop-check">✓</span>{/if}
							</button>
						{:else}
							<div class="pop-empty" style="padding:8px 12px">No unassigned guests</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Status bar -->
			<div class="status-bar">
				<span>
					{#if tool === 'measure'}
						{measureStart && !measureEnd ? 'Click second point to measure' : measureEnd ? 'Click to start new measurement · Esc to clear' : 'Click first point'} · Esc to cancel
					{:else if tool === 'bounds'}
						{boundsStart ? 'Click second corner to finish bounds' : 'Click first corner of boundary rectangle'} · Esc to cancel
					{:else if isDrawing}
						● Drawing {tool} — {drawPts.length} pts · Click start to close · Enter · Esc
					{:else if tool === 'table'}
						Click to place table · {ghostValid ? 'Valid position' : 'Blocked by wall'}
					{:else if tool === 'select' && selectedTable}
						{selectedTable.label} · rotate handle above · Delete to remove
					{:else}
						{TOOL_LABELS[tool]}
					{/if}
				</span>
				<span class="status-coords">
					{cursorPos.x.toFixed(2)} m, {cursorPos.y.toFixed(2)} m · snap {gridSnap} m
				</span>
			</div>
		</main>

		<!-- Right panel -->
		<aside class="panel">
			<!-- Tabs -->
			<div class="tabs">
				<button class="tab" class:active={activeTab==='props'} onclick={() => activeTab='props'}>Properties</button>
				<button class="tab" class:active={activeTab==='guests'} onclick={() => activeTab='guests'}>
					Guests
					{#if guests.length > 0}
						<span class="tab-badge">{totalAssigned}/{guests.length}</span>
					{/if}
				</button>
			</div>

			<!-- ── Properties tab ── -->
			{#if activeTab === 'props'}

				<!-- Table inventory selector (when types provided) -->
				{#if tableTypes && tableTypes.length > 0 && tool === 'table' && !selectedTable}
					<section>
						<div class="sec-title">Inventory</div>
						<div class="inventory-list">
							{#each tableTypes as tt}
								<button class="inventory-item" class:active={selectedTypeId === tt.id}
									onclick={() => { selectedTypeId = tt.id; }}>
									<div class="inv-preview">
										{#if tt.shape === 'round'}
											<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="14" fill="#92400e" opacity="0.8"/></svg>
										{:else}
											<svg viewBox="0 0 40 40"><rect x="4" y="10" width="32" height="20" rx="3" fill="#92400e" opacity="0.8"/></svg>
										{/if}
									</div>
									<div class="inv-info">
										<span class="inv-name">{tt.name}</span>
										<span class="inv-detail">
											{tt.shape === 'round' ? 'Round' : 'Rect'}
											· {tt.max_chairs} chairs
										</span>
									</div>
								</button>
							{/each}
						</div>
						{#if selectedType}
							<div class="inv-selected-info">
								{selectedType.shape === 'round' ? `r=${selectedType.radius}m` : `${selectedType.width}×${selectedType.height}m`}
								· {selectedType.max_chairs} chairs
							</div>
						{/if}
					</section>
				{/if}

				<!-- Table config (new table or selected) -->
				{#if (tool === 'table' && !(tableTypes && tableTypes.length > 0)) || selectedTable}
					{@const T = selectedTable}
					{@const isInventoryTable = T?.typeId && tableTypes?.find(tt => tt.id === T.typeId)}
					{@const maxChairs = isInventoryTable ? Number((tableTypes?.find(tt => tt.id === T?.typeId))?.max_chairs ?? 999) : 999}
					<section>
						<div class="sec-title">{T ? T.label : 'New table'}</div>

						{#if T}
							<div class="field">
								<label for="t-lbl">Name</label>
								<input id="t-lbl" type="text" value={T.label}
									oninput={(e) => updateTable({ label: (e.target as HTMLInputElement).value })}/>
							</div>
						{/if}

						{#if !isInventoryTable}
							<div class="field">
								<label for="t-shp">Shape</label>
								<select id="t-shp" value={T?.shape ?? tShape}
									onchange={(e) => {
										const v = (e.target as HTMLSelectElement).value as TableShape;
										if (T) updateTable({ shape: v }); else tShape = v;
									}}>
									<option value="rect">Rectangular</option>
									<option value="round">Round</option>
								</select>
							</div>

							{#if (T?.shape ?? tShape) === 'rect'}
								<div class="field-row">
									<div class="field">
										<label for="t-w">Width (m)</label>
										<input id="t-w" type="number" min="0.5" max="12" step="0.5"
											value={T?.width ?? tWidth}
											oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({width:v}); else tWidth=v; }}/>
									</div>
									<div class="field">
										<label for="t-h">Depth (m)</label>
										<input id="t-h" type="number" min="0.5" max="12" step="0.5"
											value={T?.height ?? tHeight}
											oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({height:v}); else tHeight=v; }}/>
									</div>
								</div>
							{:else}
								<div class="field">
									<label for="t-r">Radius (m)</label>
									<input id="t-r" type="number" min="0.5" max="6" step="0.25"
										value={T?.radius ?? Math.max(tWidth,tHeight)/2}
										oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({radius:v,width:v*2,height:v*2}); else { tWidth=v*2; tHeight=v*2; } }}/>
								</div>
							{/if}
						{:else if isInventoryTable && T}
							<div class="inv-locked-info">
								{T.shape === 'round' ? `r=${T.radius}m` : `${T.width}×${T.height}m`}
								· inventory type
							</div>
						{/if}

						{#if (T?.shape ?? tShape) === 'round'}
							<div class="field">
								<label for="t-ch">Chairs {maxChairs < 999 ? `(max ${maxChairs})` : ''}</label>
								<input id="t-ch" type="number" min="0" max={maxChairs} step="1"
									value={T?.chairs ?? tChairs}
									oninput={(e) => { const v=Math.min(+((e.target as HTMLInputElement).value), maxChairs); if(T) updateTable({chairs:v}); else tChairs=v; }}/>
							</div>
						{:else}
							{@const currentTotal = T ? (Number(T.chairsTop)||0)+(Number(T.chairsBottom)||0)+(Number(T.chairsLeft)||0)+(Number(T.chairsRight)||0) : tChairsTop+tChairsBottom+tChairsLeft+tChairsRight}
							{#if maxChairs < 999}
								<div class="chair-limit-hint">{currentTotal} / {maxChairs} chairs</div>
							{/if}
							<div class="field-row">
								<div class="field">
									<label for="t-ct">Top</label>
									<input id="t-ct" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsTop ?? tChairsTop}
										oninput={(e) => { const v=Math.max(0,+((e.target as HTMLInputElement).value)||0); if(T) updateTable({chairsTop:v}); else tChairsTop=v; }}/>
								</div>
								<div class="field">
									<label for="t-cb">Bottom</label>
									<input id="t-cb" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsBottom ?? tChairsBottom}
										oninput={(e) => { const v=Math.max(0,+((e.target as HTMLInputElement).value)||0); if(T) updateTable({chairsBottom:v}); else tChairsBottom=v; }}/>
								</div>
							</div>
							<div class="field-row">
								<div class="field">
									<label for="t-cl">Left</label>
									<input id="t-cl" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsLeft ?? tChairsLeft}
										oninput={(e) => { const v=Math.max(0,+((e.target as HTMLInputElement).value)||0); if(T) updateTable({chairsLeft:v}); else tChairsLeft=v; }}/>
								</div>
								<div class="field">
									<label for="t-cr">Right</label>
									<input id="t-cr" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsRight ?? tChairsRight}
										oninput={(e) => { const v=Math.max(0,+((e.target as HTMLInputElement).value)||0); if(T) updateTable({chairsRight:v}); else tChairsRight=v; }}/>
								</div>
							</div>
						{/if}

						<div class="field">
							<label for="t-sp">Chair spacing (m)</label>
							<div style="display:flex;align-items:center;gap:8px">
								<input id="t-sp" type="range" min="0" max="0.8" step="0.05"
									value={T?.chairSpacing ?? tChairSpacing}
									oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({chairSpacing:v}); else tChairSpacing=v; }}
									style="flex:1"/>
								<span class="val">{((T?.chairSpacing ?? tChairSpacing)*100).toFixed(0)} cm</span>
							</div>
						</div>

						{#if T}
							<div class="field">
								<label for="t-rot">Rotation (°)</label>
								<input id="t-rot" type="number" min="-180" max="180" step="5"
									value={T.rotation}
									oninput={(e) => updateTable({ rotation: +((e.target as HTMLInputElement).value) })}/>
							</div>

							<!-- Seat assignments summary -->
							{@const assigned = T.assignments.filter(Boolean).length}
							<div class="seat-summary">
								<span>{assigned}/{totalChairs(T)} seats assigned</span>
								<div class="seat-dots">
									{#each T.assignments as a}
										<span class="dot" class:filled={!!a}></span>
									{/each}
								</div>
							</div>

							<button class="btn-del" onclick={() => { tables=tables.filter(t=>t.id!==selectedId); selectedId=null; }}>
								Delete table
							</button>
						{/if}
					</section>
				{/if}

				<!-- Zone config -->
				{#if tool === 'zone' || selectedZone}
					{@const Z = selectedZone}
					<section>
						<div class="sec-title">{Z ? Z.label : 'Zone options'}</div>
						{#if Z}
							<div class="field">
								<label for="z-lbl">Name</label>
								<input id="z-lbl" type="text" value={Z.label}
									oninput={(e) => updateZone({ label: (e.target as HTMLInputElement).value })}/>
							</div>
						{/if}
						<div class="field">
							<label for="z-col">Colour</label>
							<div class="swatches">
								{#each ZONE_PRESETS as c}
									<button class="swatch" class:on={(Z?.color ?? zoneColor)===c}
										style="background:{c}" aria-label="Set colour {c}"
										onclick={() => { if(Z) updateZone({color:c}); else zoneColor=c; }}></button>
								{/each}
								<input id="z-col" type="color" value={Z?.color ?? zoneColor}
									oninput={(e) => { const v=(e.target as HTMLInputElement).value; if(Z) updateZone({color:v}); else zoneColor=v; }}
									title="Custom"/>
							</div>
						</div>
						{#if Z}
							<button class="btn-del" onclick={() => { zones=zones.filter(z=>z.id!==selectedId); selectedId=null; }}>
								Delete zone
							</button>
						{/if}
					</section>
				{/if}

				<!-- Bounds config -->
				{#if (tool === 'bounds' || bounds) && tool !== 'table'}
					<section>
						<div class="sec-title">Floor plan bounds</div>
						{#if bounds}
							<div class="bounds-info">
								<div class="field-row">
									<div class="field">
										<label>X</label>
										<span class="val">{bounds.x.toFixed(1)} m</span>
									</div>
									<div class="field">
										<label>Y</label>
										<span class="val">{bounds.y.toFixed(1)} m</span>
									</div>
								</div>
								<div class="field-row">
									<div class="field">
										<label>Width</label>
										<span class="val">{bounds.w.toFixed(1)} m</span>
									</div>
									<div class="field">
										<label>Height</label>
										<span class="val">{bounds.h.toFixed(1)} m</span>
									</div>
								</div>
							</div>
							<button class="btn-del" onclick={() => { bounds = null; }}>
								Remove bounds
							</button>
						{:else}
							<p style="font-size:12px;color:var(--text-muted);line-height:1.5">
								Click two corners on the map to define the floor plan boundary.
								Area outside will be dimmed.
							</p>
						{/if}
					</section>
				{/if}

				<!-- Wall selected -->
				{#if selectedWall}
					<section>
						<div class="sec-title">Wall</div>
						<div class="stat"><span>Vertices</span><b>{selectedWall.points.length}</b></div>
						<p style="font-size:11px;color:var(--text-muted);line-height:1.4;margin:4px 0 8px">
							Drag wall to move. Drag vertices to reshape.
						</p>
						<button class="btn-del" onclick={() => { walls=walls.filter(w=>w.id!==selectedId); selectedId=null; }}>
							Delete wall
						</button>
					</section>
				{/if}

				<!-- Nothing selected tips -->
				{#if !selectedTable && !selectedWall && !selectedZone && tool==='select'}
					<section>
						<div class="sec-title">Tips</div>
						<ul class="tips">
							<li>Click a chair to assign a guest</li>
							<li>Drag the <b style="color:#7b6cf0">● handle</b> above a table to rotate</li>
							<li><kbd>Delete</kbd> removes selected element</li>
							<li><kbd>Enter</kbd> closes a drawn polygon</li>
							<li><kbd>Esc</kbd> cancels drawing or deselects</li>
						</ul>
					</section>
				{/if}

				<!-- Summary always visible -->
				<section class="summary">
					<div class="sec-title">Summary</div>
					<div class="stat"><span>Tables</span><b>{tables.length}</b></div>
					<div class="stat"><span>Total seats</span><b>{totalSeats}</b></div>
					<div class="stat"><span>Assigned</span><b>{totalAssigned}/{guests.length} guests</b></div>
					<div class="stat"><span>Walls</span><b>{walls.length}</b></div>
					<div class="stat"><span>Zones</span><b>{zones.length}</b></div>
				</section>
			{/if}

			<!-- ── Guests tab ── -->
			{#if activeTab === 'guests'}
				<section>
					<div class="sec-title">Add guest</div>
					<div class="field-row">
						<div class="field">
							<label for="g-first">First name</label>
							<input id="g-first" type="text" bind:value={newFirst} placeholder="Anna"
								onkeydown={(e) => e.key==='Enter' && addGuest()}/>
						</div>
						<div class="field">
							<label for="g-last">Last name</label>
							<input id="g-last" type="text" bind:value={newLast} placeholder="Novák"
								onkeydown={(e) => e.key==='Enter' && addGuest()}/>
						</div>
					</div>
					<div class="field">
						<label for="g-grp">Group / family (optional)</label>
						<input id="g-grp" type="text" bind:value={newGroup} placeholder="Novák family"
							onkeydown={(e) => e.key==='Enter' && addGuest()}/>
					</div>
					<button class="btn-add" onclick={addGuest}>Add guest</button>
				</section>

				{#if guests.length > 0}
					<section>
						<div class="sec-title-row">
							<span class="sec-title" style="margin-bottom:0">Guest list</span>
							<div class="guest-actions">
								<button class="btn-sm" onclick={autoAssign} title="Auto-assign seats by family/surname">
									✦ Auto-seat
								</button>
								<button class="btn-sm btn-sm-danger" onclick={clearAllAssignments} title="Clear all seat assignments">
									Clear
								</button>
							</div>
						</div>
						<div class="stat" style="margin:6px 0 8px">
							<span>Seated</span>
							<b>{totalAssigned} / {guests.length}</b>
						</div>
						<div class="guest-list">
							{#each guests.slice().sort((a,b)=>a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName)) as g}
								{@const seated = assignedIds.has(g.id)}
								{@const seat = seated
									? (() => { for (const t of tables) { const i=t.assignments.indexOf(g.id); if(i>=0) return `${t.label} #${i+1}`; } return ''; })()
									: null}
								<div class="guest-row" class:seated>
									<div class="guest-info">
										<span class="guest-name">{g.lastName}, {g.firstName}</span>
										{#if g.group}<span class="guest-grp">{g.group}</span>{/if}
										{#if seat}<span class="guest-seat">{seat}</span>{/if}
									</div>
									<button class="btn-icon" onclick={() => removeGuest(g.id)} title="Remove guest">✕</button>
								</div>
							{/each}
						</div>
					</section>
				{/if}
			{/if}
		</aside>
	</div>
</div>

<!-- ─── Styles ──────────────────────────────────────────────────────────────── -->
<style>
.app { display:flex; flex-direction:column; height:100vh; overflow:hidden; }

/* ── Header ── */
header {
	display:flex; align-items:center; gap:20px; padding:0 16px; height:44px;
	background:var(--bg-panel); border-bottom:1px solid var(--border);
	flex-shrink:0; box-shadow:0 1px 3px rgba(0,0,0,0.06); z-index:20;
}
.header-controls { display:flex; align-items:center; gap:16px; flex:1; }

/* ── Custom Select ── */
.custom-select {
	position:relative; display:inline-flex; align-items:center; gap:4px;
	padding:4px 8px; min-width:72px; border-radius:6px;
	border:1px solid var(--border); background:var(--bg-panel);
	font-size:12px; color:var(--text-base); cursor:pointer;
	user-select:none; transition:border-color 0.12s;
}
.custom-select:hover { border-color:var(--accent); }
.custom-select-value { flex:1; }
.custom-select-chevron { flex-shrink:0; color:var(--text-muted); }
.custom-select-dropdown {
	position:absolute; top:calc(100% + 4px); left:0; right:0;
	background:var(--bg-panel); border:1px solid var(--border);
	border-radius:8px; padding:4px; box-shadow:0 8px 24px rgba(0,0,0,0.10);
	z-index:50;
}
.custom-select-option {
	display:block; width:100%; padding:5px 8px; border-radius:5px;
	font-size:12px; color:var(--text-base); text-align:left;
	background:none; border:none; cursor:pointer; font-family:inherit;
}
.custom-select-option:hover { background:var(--bg-panel2); }
.custom-select-option.selected { color:var(--accent); font-weight:600; }
.ctrl { display:flex; align-items:center; gap:7px; font-size:12px; }
.val { font-size:11px; color:var(--accent); min-width:52px; font-variant-numeric:tabular-nums; }
.hint-text { font-size:11px; color:var(--text-muted); margin-left:8px; }

/* ── Body ── */
.body { display:flex; flex:1; overflow:hidden; }

/* ── Toolbar ── */
.toolbar {
	display:flex; flex-direction:column; gap:1px; padding:8px 6px;
	background:var(--bg-panel); border-right:1px solid var(--border);
	width:140px; flex-shrink:0; overflow-y:auto;
}
.tool-btn {
	display:flex; align-items:center; gap:9px; padding:9px 10px;
	width:100%; border-radius:7px; color:var(--text-muted);
	font-size:12px; font-weight:500; transition:background 0.1s, color 0.1s;
	text-align:left;
}
.tool-btn:hover:not(:disabled) { background:var(--bg-panel2); color:var(--text-base); }
.tool-btn.active { background:var(--accent-dim); color:var(--accent); font-weight:600; }
.tool-btn:disabled { opacity:0.3; cursor:default; }
.sep { height:1px; background:var(--border); margin:6px 4px; }
.finish { color:#16a34a; }
.finish:hover { background:rgba(22,163,74,0.1); }
.cancel { color:#ef4444; }
.cancel:hover { background:rgba(239,68,68,0.1); }

/* ── Canvas ── */
.canvas-wrap { flex:1; position:relative; overflow:hidden; display:flex; flex-direction:column; }
.map-svg { flex:1; display:block; width:100%; user-select:none; }
.c-cross { cursor:crosshair; }
.c-cell  { cursor:cell; }

/* ── Status bar ── */
.status-bar {
	display:flex; justify-content:space-between; align-items:center;
	padding:3px 12px; background:var(--bg-panel); border-top:1px solid var(--border);
	font-size:11px; color:var(--text-muted); height:26px; flex-shrink:0;
}
.status-coords { font-variant-numeric:tabular-nums; }

/* ── Chair popover ── */
.overlay { position:absolute; inset:0; z-index:40; }
.chair-popover {
	position:absolute; z-index:50; background:var(--bg-panel);
	border:1px solid var(--border); border-radius:10px;
	box-shadow:0 8px 24px rgba(0,0,0,0.14); width:240px;
	overflow:hidden;
}
.pop-header {
	display:flex; justify-content:space-between; align-items:center;
	padding:10px 12px 8px; font-size:12px; font-weight:600; color:var(--text-base);
	border-bottom:1px solid var(--border);
}
.pop-close { color:var(--text-muted); font-size:14px; line-height:1; padding:2px 4px; border-radius:4px; }
.pop-close:hover { background:var(--bg-panel2); color:var(--text-base); }
.pop-assigned {
	display:flex; align-items:center; gap:6px; padding:8px 12px;
	background:rgba(22,163,74,0.08); border-bottom:1px solid var(--border);
}
.pop-name { font-size:12px; font-weight:600; color:#15803d; flex:1; }
.pop-group { font-size:10px; color:var(--text-muted); background:var(--bg-panel2); padding:1px 5px; border-radius:4px; }
.pop-clear { font-size:11px; color:#ef4444; padding:3px 8px; border-radius:5px; background:rgba(239,68,68,0.1); }
.pop-clear:hover { background:rgba(239,68,68,0.2); }
.pop-empty { padding:8px 12px; font-size:12px; color:var(--text-muted); border-bottom:1px solid var(--border); }
.pop-search {
	display:block; width:100%; padding:8px 12px; border:none; border-bottom:1px solid var(--border);
	background:var(--bg-panel2); font-size:12px; outline:none; border-radius:0;
}
.pop-search:focus { background:#f0f2f7; }
.pop-list { max-height:200px; overflow-y:auto; }
.pop-guest {
	display:flex; align-items:center; gap:6px; padding:8px 12px; width:100%;
	font-size:12px; text-align:left; border-bottom:1px solid var(--border);
	transition:background 0.1s;
}
.pop-guest:hover { background:var(--bg-panel2); }
.pop-guest.current { background:rgba(123,108,240,0.08); }
.pop-gname { flex:1; color:var(--text-base); }
.pop-ggroup { font-size:10px; color:var(--text-muted); background:var(--bg-panel2); padding:1px 5px; border-radius:4px; }
.pop-check { color:var(--accent); font-weight:700; }

/* ── Right panel ── */
.panel {
	width:228px; background:var(--bg-panel); border-left:1px solid var(--border);
	flex-shrink:0; display:flex; flex-direction:column; overflow:hidden;
}
.tabs { display:flex; border-bottom:1px solid var(--border); flex-shrink:0; }
.tab {
	flex:1; padding:9px 0; font-size:12px; font-weight:500; color:var(--text-muted);
	border-bottom:2px solid transparent; transition:color 0.1s, border-color 0.1s;
}
.tab:hover { color:var(--text-base); }
.tab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
.tab-badge {
	display:inline-block; background:var(--accent-dim); color:var(--accent);
	font-size:9px; padding:1px 5px; border-radius:10px; margin-left:4px; font-weight:700;
}
/* panel scroll area */
.panel > :not(.tabs) { overflow-y:auto; flex:1; }

section { padding:12px; border-bottom:1px solid var(--border); }
.sec-title {
	font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em;
	color:var(--accent); margin-bottom:10px;
}
.sec-title-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.field { display:flex; flex-direction:column; gap:4px; margin-bottom:9px; }
.field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.toggle-row { flex-direction:row; justify-content:space-between; align-items:center; }
.toggle {
	padding:3px 10px; border-radius:12px; font-size:11px; font-weight:600;
	background:var(--bg-panel2); border:1px solid var(--border); color:var(--text-muted);
	transition:all 0.12s;
}
.toggle.on { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }

.swatches { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:4px; }
.swatch {
	width:20px; height:20px; border-radius:50%; border:2px solid transparent;
	cursor:pointer; transition:transform 0.1s, border-color 0.1s;
}
.swatch:hover { transform:scale(1.15); }
.swatch.on { border-color:var(--text-base); transform:scale(1.15); }
input[type="color"] {
	width:22px; height:22px; border-radius:50%; border:1px solid var(--border);
	padding:1px; cursor:pointer; background:none;
}

.seat-summary { margin:4px 0 8px; }
.seat-summary span { font-size:11px; color:var(--text-muted); }
.seat-dots { display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; }
.dot {
	width:8px; height:8px; border-radius:50%;
	background:var(--border);
}
.dot.filled { background:var(--accent); }

.stat { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-muted); padding:3px 0; }
.stat b { color:var(--text-base); font-weight:600; }
.summary { margin-top:auto; }

.btn-del {
	width:100%; padding:7px; border-radius:7px; background:rgba(239,68,68,0.08);
	color:#ef4444; font-size:12px; font-weight:600; transition:background 0.1s; margin-top:4px;
}
.btn-del:hover { background:rgba(239,68,68,0.18); }

.btn-add {
	width:100%; padding:8px; border-radius:7px; background:var(--accent-dim);
	color:var(--accent); font-size:12px; font-weight:600; transition:background 0.1s;
}
.btn-add:hover { background:#d8d2ff; }

.guest-actions { display:flex; gap:5px; }
.btn-sm {
	padding:4px 9px; border-radius:5px; font-size:11px; font-weight:600;
	background:var(--accent-dim); color:var(--accent); transition:background 0.1s;
}
.btn-sm:hover { background:#d8d2ff; }
.btn-sm-danger { background:rgba(239,68,68,0.08); color:#ef4444; }
.btn-sm-danger:hover { background:rgba(239,68,68,0.18); }

.guest-list { display:flex; flex-direction:column; max-height:340px; overflow-y:auto; margin-top:4px; }
.guest-row {
	display:flex; align-items:center; gap:6px; padding:7px 0;
	border-bottom:1px solid var(--border);
}
.guest-row:last-child { border-bottom:none; }
.guest-info { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
.guest-name { font-size:12px; color:var(--text-base); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.guest-grp  { font-size:10px; color:var(--text-muted); }
.guest-seat { font-size:10px; color:var(--accent); font-weight:600; }
.guest-row.seated .guest-name { color:var(--accent); }
.btn-icon { font-size:11px; color:var(--text-muted); padding:3px 5px; border-radius:4px; flex-shrink:0; }
.btn-icon:hover { background:rgba(239,68,68,0.1); color:#ef4444; }

.tips { list-style:none; display:flex; flex-direction:column; gap:6px; }
.tips li { font-size:11px; color:var(--text-muted); line-height:1.5; }
kbd {
	display:inline-block; padding:1px 5px; border-radius:3px;
	background:var(--bg-panel2); border:1px solid var(--border);
	font-size:10px; font-family:monospace;
}

:global(.table-g) { cursor:move; }
:global(.wall-poly, .zone-poly) { cursor:pointer; }

/* Inventory */
.inventory-list { display:flex; flex-direction:column; gap:4px; margin-top:6px; }
.inventory-item {
	display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px;
	background:var(--bg-panel2); border:1px solid var(--border); text-align:left;
	cursor:pointer; transition:border-color 0.12s, background 0.12s;
}
.inventory-item:hover { border-color:var(--accent); }
.inventory-item.active { border-color:var(--accent); background:var(--accent-dim); }
.inv-preview { width:36px; height:36px; flex-shrink:0; }
.inv-preview svg { width:100%; height:100%; }
.inv-info { display:flex; flex-direction:column; gap:2px; }
.inv-name { font-size:12px; font-weight:600; color:var(--text-base); }
.inv-detail { font-size:10px; color:var(--text-muted); }
.inv-selected-info {
	margin-top:8px; padding:8px 10px; border-radius:6px; background:var(--accent-dim);
	font-size:11px; color:var(--accent); font-weight:500; text-align:center;
}
.chair-limit-hint {
	font-size:11px; color:var(--accent); font-weight:600; margin-bottom:6px;
	text-align:right;
}
.inv-locked-info {
	margin-bottom:8px; padding:6px 10px; border-radius:6px; background:var(--bg-panel2);
	font-size:11px; color:var(--text-muted); text-align:center; border:1px solid var(--border);
}

/* ── Snap toggle ── */
.snap-toggle {
	display:flex; align-items:center; gap:5px; padding:4px 10px; border-radius:6px;
	font-size:11px; font-weight:600; color:var(--text-muted);
	background:var(--bg-panel2); border:1px solid var(--border);
	transition:all 0.12s; cursor:pointer;
}
.snap-toggle:hover { border-color:var(--accent); color:var(--text-base); }
.snap-toggle.active { background:var(--accent-dim); border-color:var(--accent); color:var(--accent); }

/* ── Floor tabs ── */
.floor-tabs {
	display:flex; align-items:center; gap:2px; margin-left:auto;
}
.floor-tab {
	padding:4px 12px; border-radius:5px; font-size:11px; font-weight:500;
	color:var(--text-muted); background:transparent; border:1px solid transparent;
	cursor:pointer; transition:all 0.12s;
}
.floor-tab:hover { background:var(--bg-panel2); color:var(--text-base); }
.floor-tab.active {
	background:var(--accent-dim); color:var(--accent); font-weight:600;
	border-color:var(--accent);
}
.floor-tab-add {
	font-size:14px; font-weight:700; padding:2px 8px; color:var(--accent);
}
.floor-tab-add:hover { background:var(--accent-dim); }
.floor-tab-del {
	font-size:12px; color:#ef4444; padding:2px 8px; margin-left:auto;
}
.floor-tab-del:hover { background:rgba(239,68,68,0.1); }

/* ── Edge rulers ── */
.ruler-corner {
	position:absolute; top:0; left:0; width:20px; height:20px; z-index:12;
	background:var(--bg-panel); border-right:1px solid var(--border); border-bottom:1px solid var(--border);
}
.ruler-top {
	position:absolute; top:0; left:20px; right:0; height:20px; z-index:11;
	background:var(--bg-panel); border-bottom:1px solid var(--border); overflow:hidden;
	pointer-events:none;
}
.ruler-left {
	position:absolute; top:20px; left:0; bottom:26px; width:20px; z-index:11;
	background:var(--bg-panel); border-right:1px solid var(--border); overflow:hidden;
	pointer-events:none;
}
.ruler-tick {
	position:absolute; bottom:0; width:1px; background:rgba(0,0,0,0.3);
}
.ruler-tick-major { height:10px; }
.ruler-tick-minor { height:5px; background:rgba(0,0,0,0.15); }
.ruler-label {
	position:absolute; left:3px; top:-1px; font-size:8px; font-family:monospace;
	color:rgba(0,0,0,0.45); white-space:nowrap; line-height:1;
}
.ruler-tick-v {
	position:absolute; right:0; height:1px; background:rgba(0,0,0,0.3);
}
.ruler-tick-major-v { width:10px; }
.ruler-tick-minor-v { width:5px; background:rgba(0,0,0,0.15); }
.ruler-label-v {
	position:absolute; right:12px; top:-4px; font-size:8px; font-family:monospace;
	color:rgba(0,0,0,0.45); white-space:nowrap; line-height:1;
}
.ruler-cursor-h {
	position:absolute; top:0; bottom:0; width:1px; background:var(--accent); opacity:0.6;
	pointer-events:none;
}
.ruler-cursor-v {
	position:absolute; left:0; right:0; height:1px; background:var(--accent); opacity:0.6;
	pointer-events:none;
}
</style>
