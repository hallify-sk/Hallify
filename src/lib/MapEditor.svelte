<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { t as tr } from '$lib/i18n.svelte';
	import { migrateToMultiFloor } from '$lib/floorplan-types';
	import {
		CHAIR_R, SEAT_R, localChairs, totalChairs, defaultChairSides, tableHitbox, seatHitbox, hitboxesOverlap,
		hitboxHitsWall, hitboxInRoom, pointInPoly, roomParts, withRoom, partsBBox, partsConnected, rectCovered, roomOutline, roomArea,
		pillarPoints, axisRect, rectPoints,
		countTablesByType, type Hitbox
	} from '$lib/floorplan-geometry';
	import type { FloorData, MultiFloorState, WallObj, ZoneObj, TableObj, SeatObj, Guest, BoundsRect, Point, TableShape } from '$lib/floorplan-types';
	import { stepsFor, toolsFor, TOOL_KEYS, toolForKey, type EditorMode, type StepId, type Tool } from '$lib/editor-steps';
	import { parseGuestCsv, splitDuplicateGuests } from '$lib/guest-csv';
	import { tableNumbers, nextTableNumber, withTableNumbers, tableTag } from '$lib/floorplan-layout';
	import { uiStore } from '$lib/stores/ui.svelte';
	import StepStrip, { type StepItem } from '$lib/editor/StepStrip.svelte';
	import ToolCards, { type ToolCard } from '$lib/editor/ToolCards.svelte';
	import GuestList, { type GuestRow } from '$lib/editor/GuestList.svelte';
	import CoachMark from '$lib/editor/CoachMark.svelte';
	import FloorplanPrint from '$lib/FloorplanPrint.svelte';
	import { labelBox, placeLabels, type LabelBox } from '$lib/editor/label-layout';

	// ─── Props ────────────────────────────────────────────────────────────────
	interface TableType {
		id: string; name: string; shape: 'rect' | 'round';
		width: number; height: number; radius: number;
		max_chairs: number;
		amount?: number;   // how many the venue owns; 0 = unlimited
	}
	type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';
	interface Props {
		initialState?: unknown;              // Existing walls/zones/tables to load
		onchange?: (json: string) => void;   // Called whenever state changes
		tableTypes?: TableType[];            // Predefined table inventory from admin
		hiddenTools?: Tool[];                // Tools to hide from the step's tool cards
		protectWallsZones?: boolean;         // Prevent erasing/selecting walls & zones
		allowZones?: boolean;                // …but still allow zones (e.g. clients organising space)
		lockFloors?: boolean;                // Hide add/remove-floor controls (reservation editor)
		tablesFromTypesOnly?: boolean;       // Only place defined admin table types (no freeform)
		/** Seat real people on this layout. A hall's own floor plan and its templates
		 *  describe the ROOM, which has no guests — a guest list only means something
		 *  once a layout belongs to a booked event. Off unless a caller opts in. */
		allowGuests?: boolean;
		/** Which guided steps to walk through. Derived from the flags above when omitted:
		 *  guests → event, a locked shell → template, otherwise the room itself. */
		mode?: EditorMode;
		/** The host page's save state and save action, shown in the last step. */
		saveState?: SaveState;
		onSave?: () => void;
		saveLabel?: string;
		/** Save on a step change. Off while saving is the user's decision (an AI draft). */
		autosave?: boolean;
		/** Tables and chairs stay where they are and only guests are seated: a hall
		 *  that does not let its clients arrange the tables. */
		lockTables?: boolean;
		/** Who is at the keyboard. A client is never told to do what only staff can. */
		audience?: 'staff' | 'client';
		/** Zones from the hall's own plan (the stage, the bar): shown, but not moved,
		 *  reshaped or deleted in a template or an event. */
		lockedZoneIds?: string[];
		/** Where "Preview & print" leads (events have a printable manifest). */
		printHref?: string;
	}
	const {
		initialState, onchange, tableTypes, hiddenTools = [], protectWallsZones = false, allowZones = false,
		lockFloors = false, tablesFromTypesOnly = false, allowGuests = false,
		mode, saveState = 'idle', onSave, saveLabel, autosave = true, printHref,
		lockTables = false, audience = 'staff', lockedZoneIds = []
	}: Props = $props();

	const lockedZones = $derived(new Set(lockedZoneIds));
	/** A zone that may be changed right now: zones are editable in this step, and it
	 *  is not one of the hall's own. */
	const zoneEditable = (id: string) => !zonesOff && !lockedZones.has(id);

	// Walls (the venue shell) can be protected while zones stay editable.
	const wallsLocked = $derived(protectWallsZones);
	const zonesLocked = $derived(protectWallsZones && !allowZones);
	// The room boundary is part of the venue shell — locked whenever walls are.
	const boundsLocked = $derived(protectWallsZones);

	const editorMode = $derived<EditorMode>(mode ?? (allowGuests ? 'event' : protectWallsZones ? 'template' : 'room'));

	// ─── Undo / Redo ──────────────────────────────────────────────────────────
	interface Snapshot { floors: FloorData[]; guests: Guest[]; activeFloorIdx: number }
	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);
	let suppressHistory = false;

	function takeSnapshot(): string {
		// Flush working copy into floors before snapshotting
		const currentFloors = floors.map((f, i) =>
			i === activeFloorIdx ? withRoom({ ...f, walls, zones, tables, seats }, roomRects) : f
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
			walls = f.walls; zones = f.zones; tables = f.tables; seats = f.seats ?? []; roomRects = roomParts(f);
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
	// A popover targets either a table chair (tableId+chairIdx) or a standalone seat (seatId).
	type ChairPopover = { tableId?: string; chairIdx?: number; seatId?: string; x: number; y: number };
	type SeatTarget = { tableId?: string; chairIdx?: number; seatId?: string };

	// ─── Map state ────────────────────────────────────────────────────────────
	let zoom     = $state(60);
	let gridSnap = $state(0.5);
	let snapDropOpen = $state(false);
	let tool     = $state<Tool>('select');

	// ─── Guided steps ─────────────────────────────────────────────────────────
	const steps = $derived(stepsFor(editorMode));
	let step = $state<StepId>(stepsFor(mode ?? (allowGuests ? 'event' : protectWallsZones ? 'template' : 'room'))[0]);
	let visited = $state<StepId[]>([]);
	const readOnly = $derived(step === 'check');
	// What may be touched right now: walls only in their own step, zones in theirs
	// (and next to the chairs, where events add a dance floor).
	const wallsOff = $derived(wallsLocked || step !== 'walls');
	const zonesOff = $derived(zonesLocked || !(step === 'zones' || step === 'chairs'));

	// ─── Multi-floor state ────────────────────────────────────────────────────
	let floors = $state<FloorData[]>([{ id: crypto.randomUUID(), name: 'Floor 1', walls: [], zones: [], tables: [], bounds: null }]);
	let activeFloorIdx = $state(0);

	// Working copy of active floor (all mutations use these, synced on floor switch)
	let walls  = $state<WallObj[]>([]);
	let zones  = $state<ZoneObj[]>([]);
	let tables = $state<TableObj[]>([]);
	let seats  = $state<SeatObj[]>([]);   // standalone chairs on the active floor
	// Tracks a press on a seat that hasn't moved yet — pointerup turns it into an
	// assignment-popover open (a drag past threshold cancels it and moves instead).
	let seatClickCandidate = $state<{ id: string; x: number; y: number } | null>(null);

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
	let tChairSpacing       = $state(0.15);

	// Zone config
	let zoneColor = $state('#a78bfa');

	// Pillar config: its size across, and square or round.
	let pillarSize  = $state(0.5);
	let pillarRound = $state(false);
	function pillarAt(c: Point): WallObj {
		return { id: crypto.randomUUID(), points: pillarPoints(c, pillarSize, pillarRound) };
	}

	/** Type a rectangular wall's size (its thickness is the shorter side). The top
	 *  left corner stays put. */
	function setWallSize(id: string, patch: { w?: number; h?: number }) {
		const w = walls.find(x => x.id === id);
		const r = w ? axisRect(w.points) : null;
		if (!r) return;
		const next = { ...r, ...patch };
		if (!(next.w > 0.01) || !(next.h > 0.01)) return;
		walls = walls.map(x => x.id === id ? { ...x, points: rectPoints(next) } : x);
	}

	// The room: one or more rectangles joined into one shape (two make an L, three
	// a U). `bounds` is their bounding box; `roomEdges` the outline tables may not cross.
	let roomRects = $state<BoundsRect[]>([]);
	const bounds = $derived(partsBBox(roomRects));
	const roomEdges = $derived(roomOutline(roomRects));
	let boundsStart = $state<Point | null>(null);  // first corner during drawing
	let hoverPart = $state<number | null>(null);
	/** A short reason shown in the instruction bar when the room refused a change. */
	let roomNotice = $state<string | null>(null);
	let roomNoticeTimer: ReturnType<typeof setTimeout> | undefined;
	function noticeRoom(msg: string) {
		roomNotice = msg;
		clearTimeout(roomNoticeTimer);
		roomNoticeTimer = setTimeout(() => { roomNotice = null; }, 4500);
	}
	/** Remove a room part, unless that would leave the rest in separate pieces. */
	function removeRoomPart(idx: number): boolean {
		const rest = roomRects.filter((_, j) => j !== idx);
		if (!partsConnected(rest)) { noticeRoom(tr.editor.roomWouldSplit); return false; }
		pushUndo();
		roomRects = rest;
		hoverPart = null; selectedPart = null;
		return true;
	}   // room part highlighted from the panel list
	// A room part picked with Select & move: dragged whole, or resized by a corner.
	let selectedPart = $state<number | null>(null);
	let partDrag = $state<{ idx: number; kind: 'move' | 'resize'; corner: number; start: Point; orig: BoundsRect } | null>(null);

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
	let spaceDown = $state(false);   // Space + drag pans, like every canvas tool

	// Measure tool
	let measureStart = $state<Point | null>(null);
	let measureEnd   = $state<Point | null>(null);

	// Element snapping
	let snapToElements = $state(true);
	let snapGuides     = $state<{ axis: 'x' | 'y'; value: number }[]>([]);

	// Ruler mouse tracking (screen coords within canvas)
	let rulerMouseX = $state(0);
	let rulerMouseY = $state(0);
	let showRulers  = $state(true);
	// Every measurement on the plan: always in the check step, on request elsewhere.
	let showDims    = $state(false);
	const dimsOn    = $derived(showDims || step === 'check');

	// Experimental: walls and zones start as a dragged rectangle; an edge of the
	// selected shape takes a new corner on click, which can be dragged at once.
	// A plain click (no drag) still starts the corner-by-corner polygon.
	const RECT_KEY = 'hallify-editor-rectdraw';
	let rectDraw   = $state(true);
	let rectStart  = $state<Point | null>(null);
	let rectMoved  = $state(false);

	// Canvas annotations
	let showSeatNumbers = $state(untrack(() => allowGuests));
	let showNames       = $state(true);

	// ─── Guest system ─────────────────────────────────────────────────────────
	let guests       = $state<Guest[]>([]);
	// Existing group/family names for the combobox suggestions.
	const existingGroups = $derived(
		[...new Set(guests.map(g => g.group?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b))
	);
	let guestSearch  = $state('');
	let chairPopover = $state<ChairPopover | null>(null);
	let importMessage = $state<string | null>(null);
	let importMessageTimer: ReturnType<typeof setTimeout> | undefined;
	// A guest being dragged from the list onto a chair.
	let dragGuest  = $state<{ id: string; x: number; y: number } | null>(null);
	let dragTarget = $state<SeatTarget | null>(null);

	// ─── Floor management ────────────────────────────────────────────────────
	/** Flush working copy back into floors array */
	function saveCurrentFloor() {
		floors[activeFloorIdx] = withRoom({ ...floors[activeFloorIdx], walls, zones, tables, seats }, roomRects);
	}

	/** Switch to a different floor */
	function loadFloor(idx: number) {
		saveCurrentFloor();
		activeFloorIdx = idx;
		const f = floors[idx];
		walls = f.walls; zones = f.zones; tables = f.tables; seats = f.seats ?? []; roomRects = roomParts(f);
		selectedId = null; selectedPart = null; chairPopover = null;
	}

	function addFloor() {
		if (lockFloors) return;
		pushUndo();
		saveCurrentFloor();
		const newFloor: FloorData = {
			id: crypto.randomUUID(), name: `Floor ${floors.length + 1}`,
			walls: [], zones: [], tables: [], seats: [], bounds: null,
		};
		floors = [...floors, newFloor];
		activeFloorIdx = floors.length - 1;
		walls = []; zones = []; tables = []; seats = []; roomRects = [];
		selectedId = null; selectedPart = null; chairPopover = null;
	}

	function removeFloor(idx: number) {
		if (lockFloors) return;
		if (floors.length <= 1) return;
		pushUndo();
		saveCurrentFloor();
		floors = floors.filter((_, i) => i !== idx);
		if (activeFloorIdx >= floors.length) activeFloorIdx = floors.length - 1;
		else if (idx < activeFloorIdx) activeFloorIdx--;
		const f = floors[activeFloorIdx];
		walls = f.walls; zones = f.zones; tables = f.tables; seats = f.seats ?? []; roomRects = roomParts(f);
		selectedId = null; selectedPart = null; chairPopover = null;
		confirmRemoveIdx = null;
	}

	// Inline rename: the tab turns into a field, Enter or leaving it commits.
	let renamingIdx = $state<number | null>(null);
	let renameValue = $state('');
	let confirmRemoveIdx = $state<number | null>(null);
	function startRename(idx: number) {
		if (lockFloors) return;
		renamingIdx = idx; renameValue = floors[idx].name;
	}
	function commitRename() {
		if (renamingIdx === null) return;
		const name = renameValue.trim();
		if (name && name !== floors[renamingIdx].name) {
			pushUndo();
			floors = floors.map((f, i) => i === renamingIdx ? { ...f, name } : f);
		}
		renamingIdx = null;
	}

	// ─── Load initial state from prop ────────────────────────────────────────
	$effect(() => {
		if (!initialState) return;
		try {
			const raw = typeof initialState === 'string' ? JSON.parse(initialState) : initialState;
			const state = migrateToMultiFloor(raw);
			// Every table gets its number now, so it is stored with the next save and
			// stays put when other tables come and go.
			const numbered = withTableNumbers(state.floors);
			const f0 = numbered[0]; // use local var, NOT reactive `floors`
			floors = numbered;
			guests = state.guests;
			activeFloorIdx = 0;
			walls = f0.walls; zones = f0.zones; tables = f0.tables; seats = f0.seats ?? []; roomRects = roomParts(f0);
			// Open on the whole room, not on its top-left corner.
			requestAnimationFrame(() => fitToRoom());
		} catch { /* ignore parse errors */ }
	});

	// ─── Notify parent of state changes ──────────────────────────────────────
	$effect(() => {
		if (!onchange) return;
		// Access reactive working copy to create dependency
		const snap = { walls, zones, tables, seats };
		const room = roomRects;
		// The floors list is read tracked as well: renaming a floor changes nothing but
		// `floors`, and with it untracked a rename was never reported, so never saved.
		const idx = activeFloorIdx;
		const currentFloors = floors.map((f, i) => (i === idx ? withRoom({ ...f, ...snap }, room) : f));
		const state: MultiFloorState = { version: 2, floors: currentFloors, guests };
		onchange(JSON.stringify(state));
	});

	// ─── SVG ref ──────────────────────────────────────────────────────────────
	let svgEl: SVGSVGElement;

	// ─── Coordinate helpers ───────────────────────────────────────────────────
	const wx = (x: number) => x * zoom + panX;
	const wy = (y: number) => y * zoom + panY;
	const ws = (s: number) => s * zoom;
	/**
	 * How close the cursor must be to the first point to CLOSE a shape.
	 *
	 * Screen-space, not world-space. `zoom` is pixels-per-metre, so a world radius
	 * would grow with zoom and swallow the fourth corner of a small square. A
	 * constant 12 px feels identical at every zoom, and is independent of grid snap
	 * so closing still works — and still previews green — with snapping off.
	 */
	const CLOSE_HIT_PX = 12;
	const closeRadius = $derived(CLOSE_HIT_PX / zoom);

	/** True when `p` is close enough to the first drawn point to finish the shape. */
	function nearFirstPoint(p: Point): boolean {
		if (drawPts.length < 3) return false;
		const first = drawPts[0];
		return Math.hypot(p.x - first.x, p.y - first.y) < closeRadius;
	}

	const sx = (px: number) => (px - panX) / zoom;
	const sy = (py: number) => (py - panY) / zoom;

	function svgCoords(e: MouseEvent | PointerEvent): Point {
		const r = svgEl.getBoundingClientRect();
		return { x: sx(e.clientX - r.left), y: sy(e.clientY - r.top) };
	}
	function snap(p: Point): Point {
		// 0 = snapping off.
		if (!gridSnap) return { x: p.x, y: p.y };
		return { x: Math.round(p.x / gridSnap) * gridSnap, y: Math.round(p.y / gridSnap) * gridSnap };
	}

	// ─── View: fit and zoom ───────────────────────────────────────────────────
	/** Everything on the active floor, as a box in metres. */
	function contentBBox(): BoundsRect | null {
		const xs: number[] = [], ys: number[] = [];
		for (const w of walls) for (const p of w.points) { xs.push(Number(p.x)); ys.push(Number(p.y)); }
		for (const z of zones) for (const p of z.points) { xs.push(Number(p.x)); ys.push(Number(p.y)); }
		for (const t of tables) { xs.push(Number(t.x) - 2, Number(t.x) + 2); ys.push(Number(t.y) - 2, Number(t.y) + 2); }
		for (const s of seats) { xs.push(Number(s.x)); ys.push(Number(s.y)); }
		if (!xs.length) return null;
		const x = Math.min(...xs), y = Math.min(...ys);
		return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
	}
	/** Zoom and pan so the room (or whatever is drawn) fills the canvas with a margin. */
	function fitToRoom() {
		const r = svgEl?.getBoundingClientRect();
		if (!r || r.width < 50 || r.height < 50) return;
		const b = bounds ?? contentBBox();
		if (!b || b.w <= 0 || b.h <= 0) { zoom = 60; panX = 40; panY = 40; return; }
		const pad = 1; // metres of air around the room
		const fit = Math.min((r.width - 32) / (b.w + 2 * pad), (r.height - 96) / (b.h + 2 * pad));
		const z = Math.min(200, Math.max(15, fit));
		zoom = z;
		panX = (r.width - b.w * z) / 2 - b.x * z;
		panY = (r.height - b.h * z) / 2 - b.y * z + 14;
	}
	/** Zoom around the canvas centre by a factor, within the usual limits. */
	function zoomBy(factor: number) {
		const r = svgEl?.getBoundingClientRect();
		const cx = r ? r.width / 2 : 0, cy = r ? r.height / 2 : 0;
		const nz = Math.min(200, Math.max(15, zoom * factor));
		panX = cx - (cx - panX) * (nz / zoom); panY = cy - (cy - panY) * (nz / zoom); zoom = nz;
	}

	// ─── Geometry ─────────────────────────────────────────────────────────────
	// Footprints, collisions and the room outline live in floorplan-geometry.ts so
	// the rules are tested and shared; what is here is editor-only hit testing.
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
	// A table (chairs included) must stay on the room's floor and clear the walls,
	// the other tables and the standalone chairs.
	function hitsWalls(hb: Hitbox): boolean {
		return walls.some(w => hitboxHitsWall(hb, w));
	}

	function tableHasCollision(candidate: TableObj, excludeId?: string, otherTables?: TableObj[]): boolean {
		const hb = tableHitbox(candidate);
		if (hitsWalls(hb)) return true;
		if (!hitboxInRoom(hb, roomRects, roomEdges)) return true;
		const others = otherTables ?? tables;
		const filtered = excludeId ? others.filter(o => o.id !== excludeId) : others;
		if (filtered.some(o => hitboxesOverlap(hb, tableHitbox(o)))) return true;
		return seats.some(s => hitboxesOverlap(hb, seatHitbox(s)));
	}

	/** A standalone chair must clear walls, the room's edge, tables, and other chairs. */
	function seatHasCollision(candidate: SeatObj, excludeId?: string): boolean {
		const hb = seatHitbox(candidate);
		if (hitsWalls(hb)) return true;
		if (!hitboxInRoom(hb, roomRects, roomEdges)) return true;
		if (tables.some(t => hitboxesOverlap(hb, tableHitbox(t)))) return true;
		const others = excludeId ? seats.filter(s => s.id !== excludeId) : seats;
		return others.some(o => hitboxesOverlap(hb, seatHitbox(o)));
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
	function findClickedChair(t: TableObj, p: Point, radius = CHAIR_R): number {
		const a = -(Number(t.rotation) * Math.PI) / 180;
		const cos = Math.cos(a), sin = Math.sin(a);
		const dx = p.x - Number(t.x), dy = p.y - Number(t.y);
		const lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
		const chairs = localChairs(t);
		for (let i = 0; i < chairs.length; i++) {
			const cdx = lx - chairs[i].x, cdy = ly - chairs[i].y;
			if (Math.sqrt(cdx * cdx + cdy * cdy) <= radius) return i;
		}
		return -1;
	}

	/** Where a table's chair sits on screen (canvas pixels), for anchoring a popover. */
	function chairScreenPos(t: TableObj, ci: number): Point {
		const ch = localChairs(t)[ci];
		if (!ch) return { x: wx(Number(t.x)), y: wy(Number(t.y)) };
		const a = (Number(t.rotation) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
		return { x: wx(Number(t.x) + ch.x * cos - ch.y * sin), y: wy(Number(t.y) + ch.x * sin + ch.y * cos) };
	}

	// Full hit test (body + chairs) – used for eraser
	function tableHit(t: TableObj, p: Point): boolean {
		return tableBodyHit(t, p) || findClickedChair(t, p) >= 0;
	}

	// ─── Guest helpers ────────────────────────────────────────────────────────
	function addGuest(first: string, last: string, group: string) {
		if (!first && !last) return;
		// A one-word name is kept as the surname so the list has something to sort on.
		if (!last) { last = first; first = ''; }
		pushUndo();
		guests = [...guests, { id: crypto.randomUUID(), firstName: first, lastName: last, group: group || undefined }];
	}

	function importGuests(text: string) {
		const rows = parseGuestCsv(text);
		if (!rows.length) { importMessage = tr.editor.importNone; return; }
		// Importing the same sheet again must not double everyone: people already on
		// the list are left out, and the message says who.
		const { fresh, duplicates } = splitDuplicateGuests(guests, rows);
		if (fresh.length) {
			pushUndo();
			guests = [...guests, ...fresh.map(r => ({ id: crypto.randomUUID(), firstName: r.firstName, lastName: r.lastName, group: r.group, note: r.note }))];
		}
		const dupNames = duplicates.slice(0, 3).map(g => `${g.firstName} ${g.lastName}`.trim()).join(', ') + (duplicates.length > 3 ? ' …' : '');
		importMessage = [
			fresh.length || !duplicates.length ? tr.editor.importDone(fresh.length) : '',
			duplicates.length ? tr.editor.importSkippedDuplicates(duplicates.length, dupNames) : ''
		].filter(Boolean).join(' · ');
		clearTimeout(importMessageTimer);
		importMessageTimer = setTimeout(() => { importMessage = null; }, duplicates.length ? 9000 : 5000);
	}

	function updateGuestNote(id: string, note: string) {
		const v = note.trim();
		guests = guests.map(g => g.id === id ? { ...g, note: v || undefined } : g);
	}

	function removeGuest(id: string) {
		pushUndo();
		guests = guests.filter(g => g.id !== id);
		// Clear from current floor (tables + standalone seats)
		tables = tables.map(t => ({ ...t, assignments: t.assignments.map(a => a === id ? null : a) }));
		seats = seats.map(s => s.assignment === id ? { ...s, assignment: null } : s);
		// Clear from other floors
		floors = floors.map((f, i) => i === activeFloorIdx ? f : ({
			...f,
			tables: f.tables.map(t => ({ ...t, assignments: t.assignments.map(a => a === id ? null : a) })),
			seats: (f.seats ?? []).map(s => s.assignment === id ? { ...s, assignment: null } : s)
		}));
	}

	/** Put a guest on one chair (table chair or standalone seat), taking them off
	 *  wherever they sat before — on any floor. */
	function assignGuestTo(guestId: string, target: SeatTarget) {
		const { tableId, chairIdx, seatId } = target;
		pushUndo();
		// Remove guest from ALL floors' tables AND standalone seats first
		floors = floors.map((f, fi) => {
			if (fi === activeFloorIdx) return f;
			return {
				...f,
				tables: f.tables.map(t => {
					const a = [...t.assignments];
					for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
					return { ...t, assignments: a };
				}),
				seats: (f.seats ?? []).map(s => s.assignment === guestId ? { ...s, assignment: null } : s)
			};
		});
		// Now (re)assign on the current floor
		tables = tables.map(t => {
			const a = [...t.assignments];
			for (let i = 0; i < a.length; i++) if (a[i] === guestId) a[i] = null;
			if (tableId && t.id === tableId && chairIdx != null) a[chairIdx] = guestId;
			return { ...t, assignments: a };
		});
		seats = seats.map(s => {
			let assignment = s.assignment === guestId ? null : s.assignment;
			if (seatId && s.id === seatId) assignment = guestId;
			return { ...s, assignment };
		});
	}

	function assignGuest(guestId: string) {
		if (!chairPopover) return;
		assignGuestTo(guestId, chairPopover);
		chairPopover = null; guestSearch = '';
	}

	function clearSeat(target: SeatTarget) {
		const { tableId, chairIdx, seatId } = target;
		pushUndo();
		if (seatId) {
			seats = seats.map(s => s.id === seatId ? { ...s, assignment: null } : s);
		} else if (tableId && chairIdx != null) {
			tables = tables.map(t => {
				if (t.id !== tableId) return t;
				const a = [...t.assignments]; a[chairIdx] = null;
				return { ...t, assignments: a };
			});
		}
	}

	function clearChairAssignment() {
		if (!chairPopover) return;
		clearSeat(chairPopover);
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
		pushUndo();
		tables = tables.map(t => ({ ...t, assignments: Array(totalChairs(t)).fill(null) }));
		seats = seats.map(s => ({ ...s, assignment: null }));
	}

	/** Clear every seat of one table. */
	function clearTableSeats(tableId: string) {
		pushUndo();
		tables = tables.map(t => t.id === tableId ? { ...t, assignments: Array(totalChairs(t)).fill(null) } : t);
	}

	/**
	 * Seat everyone who has no seat yet, keeping what is already placed. Guests are
	 * grouped by family (or surname); a group goes to a table that already seats
	 * some of it when there is room, else to the smallest table that fits all of
	 * it, else it is split across the tables with the most free seats.
	 */
	function autoSeatRest() {
		const unseated = guests.filter(g => !assignedIds.has(g.id));
		if (!unseated.length) return;
		pushUndo();
		const keyOf = (g: Guest) => (g.group?.trim() || g.lastName.trim()).toLowerCase();
		const keyOfId = (id: string) => { const g = guests.find(x => x.id === id); return g ? keyOf(g) : ''; };
		const groups = new Map<string, Guest[]>();
		for (const g of unseated) {
			const k = keyOf(g);
			if (!groups.has(k)) groups.set(k, []);
			groups.get(k)!.push(g);
		}
		const sortedGroups = [...groups.entries()]
			.sort(([ka, a], [kb, b]) => b.length - a.length || ka.localeCompare(kb))
			.map(([, g]) => [...g].sort((a, b) => a.firstName.localeCompare(b.firstName)));

		const work = snapTables(tables);
		const freeOf = (t: TableObj) => t.assignments.filter(a => a === null).length;
		const fill = (idx: number, people: Guest[]) => {
			const a = [...work[idx].assignments];
			let g = 0;
			for (let j = 0; j < a.length && g < people.length; j++) if (a[j] === null) a[j] = people[g++].id;
			work[idx] = { ...work[idx], assignments: a };
		};
		for (const group of sortedGroups) {
			const key = keyOf(group[0]);
			// Join the rest of the family where it already sits, if there is room.
			let idx = work.findIndex(t => freeOf(t) >= group.length && t.assignments.some(a => a !== null && keyOfId(a) === key));
			if (idx < 0) {
				let bestFree = Infinity;
				work.forEach((t, i) => { const f = freeOf(t); if (f >= group.length && f < bestFree) { bestFree = f; idx = i; } });
			}
			if (idx >= 0) { fill(idx, group); continue; }
			// Doesn't fit any single table – fill across tables by largest-free-first
			const remaining = [...group];
			while (remaining.length > 0) {
				let maxFree = 0, maxIdx = -1;
				work.forEach((t, i) => { const f = freeOf(t); if (f > maxFree) { maxFree = f; maxIdx = i; } });
				if (maxIdx === -1) break;
				fill(maxIdx, remaining.splice(0, maxFree));
			}
		}
		tables = work;
	}

	// ─── Derived ──────────────────────────────────────────────────────────────
	const selectedTable = $derived(tables.find(t => t.id === selectedId) ?? null);
	const selectedWall  = $derived(walls.find(w => w.id === selectedId) ?? null);
	const selectedZone  = $derived(zones.find(z => z.id === selectedId) ?? null);
	const selectedSeat  = $derived(seats.find(s => s.id === selectedId) ?? null);

	const ghostW = $derived(selectedType ? Number(selectedType.width) : tWidth);
	const ghostH = $derived(selectedType ? Number(selectedType.height) : tHeight);
	const ghostR = $derived(selectedType ? Number(selectedType.radius) : Math.max(tWidth, tHeight) / 2);
	const ghostShape = $derived(selectedType ? selectedType.shape : tShape);
	const ghostCh = $derived(selectedType ? Number(selectedType.max_chairs) : tChairs);

	/** Chairs per side for a new table. A table type only says how many it seats,
	 *  so those go round it the sensible way; a freeform table uses the panel's values. */
	function newTableSides(type: TableType | null) {
		if (type && type.shape === 'rect') {
			return defaultChairSides(Number(type.width), Number(type.height), Number(type.max_chairs), tChairSpacing);
		}
		return { chairsTop: tChairsTop, chairsBottom: tChairsBottom, chairsLeft: tChairsLeft, chairsRight: tChairsRight };
	}

	function makeGhostTable(x: number, y: number): TableObj {
		return {
			id: '__ghost__', x, y, width: ghostW, height: ghostH,
			radius: ghostR, shape: ghostShape, chairs: ghostCh,
			...newTableSides(selectedType),
			rotation: 0, label: '', chairSpacing: tChairSpacing, assignments: []
		};
	}

	// ─── Table inventory ──────────────────────────────────────────────────────
	// A type's `amount` is how many of that table the venue owns. Every floor of
	// the plan draws from the same stock; 0 means there is no limit.
	const usedByType = $derived.by(() => countTablesByType(allFloors));
	function typeLimit(tt: TableType): number {
		const n = Number(tt.amount) || 0;
		return n > 0 ? n : Infinity;
	}
	function typeLeft(tt: TableType): number {
		return typeLimit(tt) - (usedByType.get(tt.id) ?? 0);
	}
	const selectedTypeExhausted = $derived(!!selectedType && typeLeft(selectedType) <= 0);
	/** Types placed more often than the venue owns them — the server refuses such a save. */
	const stockOverages = $derived.by(() =>
		(tableTypes ?? []).filter(tt => Number.isFinite(typeLimit(tt)) && typeLeft(tt) < 0)
			.map(tt => `${tt.name} ${usedByType.get(tt.id) ?? 0}/${typeLimit(tt)}`)
	);

	const ghostValid = $derived.by(() => {
		if (selectedTypeExhausted) return false;
		const ghost = makeGhostTable(cursorPos.x, cursorPos.y);
		const snap = snapTables(tables);
		return !tableHasCollision(ghost, undefined, snap);
	});

	/** Tables that overlap something or stand off the floor — loaded that way, or
	 *  made so by a size or chair change in the panel. Shown in red, never moved. */
	const collidingIds = $derived.by(() => {
		const snap = snapTables(tables);
		return new Set(snap.filter(t => tableHasCollision(t, t.id, snap)).map(t => t.id));
	});

	const ghostChairs = $derived(localChairs(makeGhostTable(0, 0)));

	const assignedIds      = $derived(new Set([
		...tables.flatMap(t => t.assignments.filter(Boolean) as string[]),
		...seats.map(s => s.assignment).filter(Boolean) as string[],
		...floors.flatMap((f, i) => i === activeFloorIdx ? [] : [
			...f.tables.flatMap(t => t.assignments.filter(Boolean) as string[]),
			...(f.seats ?? []).map(s => s.assignment).filter(Boolean) as string[]
		])
	]));
	const totalAssigned    = $derived(assignedIds.size);
	const totalSeats       = $derived(tables.reduce((s, t) => s + totalChairs(t), 0) + seats.length);
	const unseatedCount    = $derived(guests.filter(g => !assignedIds.has(g.id)).length);

	// Whole-plan totals. The panel above only ever described the active floor, which
	// is misleading on a multi-floor venue — show both.
	const allFloors = $derived(
		floors.map((f, i) => (i === activeFloorIdx ? { ...f, walls, zones, tables, seats } : f))
	);
	const allTables = $derived(allFloors.reduce((n, f) => n + (f.tables?.length ?? 0), 0));
	const allWalls  = $derived(allFloors.reduce((n, f) => n + (f.walls?.length ?? 0), 0));
	const allZones  = $derived(allFloors.reduce((n, f) => n + (f.zones?.length ?? 0), 0));
	const allSeats  = $derived(allFloors.reduce(
		(n, f) => n + (f.tables ?? []).reduce((m, t) => m + totalChairs(t), 0) + (f.seats?.length ?? 0), 0));

	// Table numbers across every floor: T1, T2… on the plan, in seat chips and on the
	// printed manifest alike (all tables of one type share a label).
	const tableNums = $derived(tableNumbers(allFloors));
	function tagOf(t: TableObj): string {
		return tableTag(tableNums.get(t.id) ?? t.num);
	}
	/** "T3 · Okrúhly stôl", or just "T3" when the table has no label of its own. */
	function tableName(t: TableObj): string {
		const tag = tagOf(t), label = (t.label ?? '').trim();
		return label && label !== tag ? `${tag} · ${label}` : tag;
	}

	/** Where a guest sits, as the list prints it. */
	function seatRefOf(guestId: string): string | null {
		for (const t of tables) { const i = t.assignments.indexOf(guestId); if (i >= 0) return tr.editor.seatRef(tagOf(t), i + 1); }
		const si = seats.findIndex(s => s.assignment === guestId);
		if (si >= 0) return tr.editor.chairRef(si + 1);
		for (let fi = 0; fi < floors.length; fi++) {
			if (fi === activeFloorIdx) continue;
			const f = floors[fi];
			if (f.tables.some(t => t.assignments.includes(guestId)) || (f.seats ?? []).some(s => s.assignment === guestId)) return f.name;
		}
		return null;
	}
	const guestRows = $derived<GuestRow[]>(guests.map(g => ({ ...g, seatRef: seatRefOf(g.id) })));

	/** The rest of a family that already sits at the selected table and still has free seats. */
	const groupSuggestion = $derived.by(() => {
		const T = selectedTable;
		if (!T || step !== 'guests') return null;
		const free = T.assignments.map((a, i) => (a ? -1 : i)).filter(i => i >= 0);
		if (!free.length) return null;
		const groupsHere = new Set(
			T.assignments.filter(Boolean).map(id => guests.find(g => g.id === id)?.group?.trim()).filter((x): x is string => !!x)
		);
		for (const grp of groupsHere) {
			const rest = guests.filter(g => g.group?.trim() === grp && !assignedIds.has(g.id));
			if (rest.length) return { group: grp, guests: rest.slice(0, free.length), total: rest.length, freeSeats: free };
		}
		return null;
	});
	function seatSuggestion() {
		const s = groupSuggestion;
		if (!s || !selectedTable) return;
		pushUndo();
		const id = selectedTable.id;
		tables = tables.map(t => {
			if (t.id !== id) return t;
			const a = [...t.assignments];
			let k = 0;
			for (const seat of s.freeSeats) { if (k >= s.guests.length) break; a[seat] = s.guests[k++].id; }
			return { ...t, assignments: a };
		});
	}

	const popoverTable = $derived.by(() => {
		const cp = chairPopover;
		return cp?.tableId ? tables.find(t => t.id === cp.tableId) ?? null : null;
	});
	const popoverSeat = $derived.by(() => {
		const cp = chairPopover;
		return cp?.seatId ? seats.find(s => s.id === cp.seatId) ?? null : null;
	});
	// The guest id currently in the popover's target (table chair or standalone seat).
	const popoverCurrentId = $derived.by(() => {
		const cp = chairPopover;
		if (!cp) return null;
		if (cp.seatId) return popoverSeat?.assignment ?? null;
		if (cp.tableId && cp.chairIdx != null) return popoverTable?.assignments[cp.chairIdx] ?? null;
		return null;
	});
	const popoverChairGuest = $derived.by(() => {
		const id = popoverCurrentId;
		return id ? guests.find(g => g.id === id) ?? null : null;
	});
	const filteredPopoverGuests = $derived.by(() => {
		const curId = popoverCurrentId;
		return guests
			.filter(g => {
				const isCurrent = curId === g.id;
				return isCurrent || !assignedIds.has(g.id);
			})
			.filter(g => !guestSearch ||
				`${g.firstName} ${g.lastName} ${g.group ?? ''}`.toLowerCase().includes(guestSearch.toLowerCase()))
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
	});

	/** Open the assignment popover on a table chair, anchored to the chair itself. */
	function openSeatPopover(t: TableObj, ci: number) {
		const p = chairScreenPos(t, ci);
		selectedId = t.id;
		chairPopover = { tableId: t.id, chairIdx: ci, x: p.x, y: p.y };
		guestSearch = '';
	}

	const patternX = $derived(((panX % zoom) + zoom) % zoom);
	const patternY = $derived(((panY % zoom) + zoom) % zoom);

	// Ruler tick computation
	const rulerStep  = $derived(gridSnap || 0.5);
	// Numbered ticks at least ~40 px apart, on a multiple of the minor step.
	const rulerMajor = $derived([1, 2, 5, 10, 20, 50].find(c => c * zoom >= 40 && Math.abs(c / rulerStep - Math.round(c / rulerStep)) < 1e-6) ?? 100);
	const rulerMinMx = $derived(Math.floor(-panX / zoom / rulerStep) * rulerStep);
	const rulerMaxMx = $derived(Math.ceil((4000 - panX) / zoom / rulerStep) * rulerStep);
	const rulerMinMy = $derived(Math.floor(-panY / zoom / rulerStep) * rulerStep);
	const rulerMaxMy = $derived(Math.ceil((4000 - panY) / zoom / rulerStep) * rulerStep);

	// ─── Steps: tools, labels, progress ───────────────────────────────────────
	const stepTools = $derived(
		toolsFor(step, {
			hasTableTypes: !!tableTypes?.length,
			tablesFromTypesOnly,
			allowZones: !zonesLocked,
			shellEditable: !protectWallsZones
		}).filter(t => !hiddenTools.includes(t))
	);
	// Never leave a tool active that the current step does not offer.
	$effect(() => { if (!stepTools.includes(tool)) tool = 'select'; });

	function stepLabel(id: StepId): string {
		switch (id) {
			case 'room': return tr.editor.stepRoom;
			case 'walls': return tr.editor.stepWalls;
			case 'zones': return tr.editor.stepZones;
			case 'tables': return tr.editor.stepTables;
			case 'chairs': return tr.editor.stepChairs;
			case 'guests': return tr.editor.stepGuests;
			case 'check': return editorMode === 'event' ? tr.editor.stepCheckPrint : tr.editor.stepCheck;
		}
	}
	function stepDone(id: StepId): boolean {
		switch (id) {
			case 'room': return roomRects.length > 0;
			case 'walls': return visited.includes('walls');
			case 'zones': return visited.includes('zones');
			case 'tables': return tables.length > 0 || visited.includes('tables');
			case 'chairs': return visited.includes('chairs');
			case 'guests': return guests.length > 0 && unseatedCount === 0;
			case 'check': return visited.includes('check') && saveState === 'saved';
		}
	}
	/** What the progress list says next to each step. */
	function stepFact(id: StepId): string {
		switch (id) {
			case 'room': return bounds ? `${bounds.w.toFixed(1)} × ${bounds.h.toFixed(1)} m · ${roomArea(roomRects).toFixed(1)} m²` : tr.editor.roomNone;
			case 'walls': return `${walls.length}`;
			case 'zones': return zones.length ? zones.slice(0, 2).map(z => z.label).filter(Boolean).join(', ') + (zones.length > 2 ? ` +${zones.length - 2}` : '') || `${zones.length}` : '0';
			case 'tables': return `${tables.length} · ${totalSeats} ${tr.editor.totalSeats.toLowerCase()}`;
			case 'chairs': return `${seats.length}`;
			case 'guests': return tr.editor.seatedOf(totalAssigned, guests.length);
			case 'check': return saveState === 'saved' ? tr.editor.saved : saveState === 'saving' ? tr.editor.saving : saveState === 'dirty' ? tr.editor.unsaved : '';
		}
	}
	const stepItems = $derived<StepItem[]>(steps.map((id, i) => ({
		id, label: stepLabel(id), index: i + 1,
		state: id === step ? 'active' : stepDone(id) ? 'done' : 'todo'
	})));
	const stepIndex = $derived(steps.indexOf(step));
	const nextStepId = $derived(stepIndex >= 0 && stepIndex < steps.length - 1 ? steps[stepIndex + 1] : null);
	const prevStepId = $derived(stepIndex > 0 ? steps[stepIndex - 1] : null);

	function goStep(id: string) {
		if (!steps.includes(id as StepId)) return;
		cancelDrawing();
		boundsStart = null; measureStart = null; measureEnd = null;
		chairPopover = null; helpOpen = false;
		partDrag = null; selectedPart = null;
		if (!visited.includes(step)) visited = [...visited, step];
		// Moving between steps saves what was done, without waiting for autosave —
		// except where nothing may be saved until the user says so (an AI draft).
		if (autosave && onSave && saveState === 'dirty' && id !== step) onSave();
		roomNotice = null;
		step = id as StepId;
		tool = 'select';
	}

	const ICONS: Record<Tool, string> = {
		select:  'M5 3l14 9-7 1.5L9 20z',
		bounds:  'M3 3h12v8h6v10H3z',
		wall:    'M3 5h18M3 12h18M3 19h18M8 5v7M16 12v7',
		pillar:  'M8 4h8v16H8zM6 4h12M6 20h12',
		zone:    'M4 6l7-3 9 4v11l-7 3-9-4z',
		table:   'M3 6h18M3 18h18M8 6v12M16 6v12',
		chair:   'M7 4v9M7 13h9M16 13v7M7 13v7M6 4h2',
		eraser:  'M20 20H7L3 16l11-11 6 6M6 17l-3-3',
		measure: 'M2 2l20 20M2 8V2h6M22 16v6h-6',
	};
	function toolName(t: Tool): string {
		switch (t) {
			case 'select': return tr.editor.toolSelect;
			case 'bounds': return tr.editor.toolRoom;
			case 'wall': return tr.editor.toolWallName;
			case 'pillar': return tr.editor.toolPillar;
			case 'zone': return tr.editor.toolZoneName;
			case 'table': return tr.editor.toolTable;
			case 'chair': return tr.editor.toolChair;
			case 'eraser': return tr.editor.toolErase;
			case 'measure': return tr.editor.toolMeasure;
		}
	}
	function toolHow(t: Tool): string {
		switch (t) {
			case 'select': return step === 'room' && !boundsLocked ? tr.editor.instrSelectRoom : tr.editor.toolSelectHow;
			case 'bounds': return tr.editor.toolRoomHow;
			case 'wall': return rectDraw ? tr.editor.toolWallHowRect : tr.editor.toolWallHow;
			case 'pillar': return tr.editor.toolPillarHow;
			case 'zone': return rectDraw ? tr.editor.toolZoneHowRect : tr.editor.toolZoneHow;
			case 'table': return tr.editor.toolTableHow;
			case 'chair': return tr.editor.toolChairHow;
			case 'eraser': return tr.editor.toolEraseHow;
			case 'measure': return tr.editor.toolMeasureHow;
		}
	}
	const toolCards = $derived<ToolCard[]>(stepTools.map(t => ({ id: t, name: toolName(t), how: toolHow(t), kbd: TOOL_KEYS[t], icon: ICONS[t] })));

	function pickTool(id: string) {
		const t = id as Tool;
		if (!stepTools.includes(t)) return;
		tool = t;
		if (t !== 'select') { selectedId = null; selectedPart = null; }
		if (t !== 'wall' && t !== 'zone') cancelDrawing();
		rectStart = null; rectMoved = false;
		if (t !== 'bounds') boundsStart = null;
		if (t !== 'measure') { measureStart = null; measureEnd = null; }
		chairPopover = null;
		// A refusal from the previous tool must not hide what this one asks for.
		roomNotice = null;
	}

	/** The one line at the top of the canvas that says what to do now. */
	const instruction = $derived.by((): string => {
		if (roomNotice) return roomNotice;
		if (readOnly) return tr.editor.instrCheck;
		if (dragGuest) return tr.editor.instrGuests;
		switch (tool) {
			case 'measure':
				return `${measureStart && !measureEnd ? tr.editor.statusMeasureSecond : measureEnd ? tr.editor.statusMeasureNew : tr.editor.statusMeasureFirst} · ${tr.editor.escToCancel}`;
			case 'bounds':
				return boundsStart ? tr.editor.instrRoomSecond : roomRects.length ? tr.editor.instrRoomMore : tr.editor.instrRoomFirst;
			case 'wall':
			case 'zone': {
				if (isDrawing) return tr.editor.instrDrawing(drawPts.length);
				if (rectStart && rectMoved) {
					const w = Math.abs(cursorPos.x - rectStart.x), h = Math.abs(cursorPos.y - rectStart.y);
					return tr.editor.instrRectDragging(w.toFixed(1), h.toFixed(1));
				}
				if (rectDraw && (tool === 'wall' ? selectedWall : selectedZone)) return tr.editor.instrEditShape;
				if (rectDraw) return tr.editor.instrRectStart;
				return tool === 'wall' ? tr.editor.instrWallStart : tr.editor.instrZoneStart;
			}
			case 'pillar':
				return tr.editor.instrPillar;
			case 'table':
				if (selectedType && selectedTypeExhausted) return tr.editor.inventoryExhausted(selectedType.name, typeLimit(selectedType));
				if (tablesFromTypesOnly && !selectedType) return tr.editor.instrTablePick;
				return ghostValid ? tr.editor.instrTableOk : tr.editor.instrTableBlocked;
			case 'chair':
				return tr.editor.instrChair;
			case 'eraser':
				return tr.editor.instrEraser;
			default:
				if (step === 'guests') return tr.editor.instrGuests;
				if (selectedTable) return tr.editor.instrSelectedTable;
				if (selectedWall || selectedZone) return rectDraw ? tr.editor.instrEditShape : tr.editor.instrSelectedPoly;
				if (step === 'room' && roomRects.length && !boundsLocked) return tr.editor.instrSelectRoom;
				return tr.editor.instrSelect;
		}
	});

	// ─── First-run coach marks ────────────────────────────────────────────────
	const TIPS_KEY = 'hallify-editor-tips';
	let tipsSeen = $state<string[]>([]);
	let tipsLoaded = $state(false);
	function coachText(id: StepId): string {
		switch (id) {
			case 'room': return tr.editor.coachRoom;
			case 'walls': return tr.editor.coachWalls;
			case 'zones': return tr.editor.coachZones;
			case 'tables': return tr.editor.coachTables;
			case 'chairs': return tr.editor.coachChairs;
			case 'guests': return tr.editor.coachGuests;
			case 'check': return tr.editor.coachCheck;
		}
	}
	const coachVisible = $derived(tipsLoaded && !tipsSeen.includes(step));
	function dismissCoach() {
		tipsSeen = [...tipsSeen, step];
		try { localStorage.setItem(TIPS_KEY, JSON.stringify(tipsSeen)); } catch { /* private mode */ }
	}

	let helpOpen = $state(false);

	// ─── Event handlers ───────────────────────────────────────────────────────
	function onPointerMove(e: PointerEvent) {
		const raw = svgCoords(e);
		cursorPos = snap(raw);

		// Track mouse position for rulers
		const r = svgEl?.getBoundingClientRect();
		if (r) { rulerMouseX = e.clientX - r.left; rulerMouseY = e.clientY - r.top; }

		if (isPanning) { panX += e.movementX; panY += e.movementY; snapGuides = []; return; }

		// A wall or zone rectangle being dragged out
		if (rectStart) {
			if (!rectMoved && Math.hypot(raw.x - rectStart.x, raw.y - rectStart.y) * zoom > 4) rectMoved = true;
			return;
		}

		// A room part being moved or resized
		if (partDrag) {
			const dx = raw.x - partDrag.start.x, dy = raw.y - partDrag.start.y;
			const o = partDrag.orig;
			let next: BoundsRect;
			if (partDrag.kind === 'move') {
				const p = snap({ x: o.x + dx, y: o.y + dy });
				next = { ...o, x: p.x, y: p.y };
			} else {
				// The corner opposite the one being dragged stays put.
				const left = partDrag.corner === 0 || partDrag.corner === 3;
				const top = partDrag.corner === 0 || partDrag.corner === 1;
				const fx = left ? o.x + o.w : o.x, fy = top ? o.y + o.h : o.y;
				const m = snap({ x: (left ? o.x : o.x + o.w) + dx, y: (top ? o.y : o.y + o.h) + dy });
				const x0 = Math.min(fx, m.x), x1 = Math.max(fx, m.x), y0 = Math.min(fy, m.y), y1 = Math.max(fy, m.y);
				next = { x: x0, y: y0, w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0) };
			}
			const moved = roomRects.map((rr, i) => i === partDrag!.idx ? next : rr);
			// A drag that would cut the part loose stops at the last joined position.
			if (partsConnected(moved)) roomRects = moved;
			else if (!roomNotice) noticeRoom(tr.editor.roomNotJoined);
			return;
		}

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

		// Standalone seat dragging (a press that moves past the threshold)
		if (isDragging && selectedId && seats.some(s => s.id === selectedId)) {
			const dx = raw.x - dragStart.x, dy = raw.y - dragStart.y;
			if (seatClickCandidate && Math.hypot(dx, dy) > 0.05) { pushUndo(); seatClickCandidate = null; }
			if (!seatClickCandidate) {
				const sb = seats.find(s => s.id === selectedId)!;
				const p = snap({ x: elemStart.x + dx, y: elemStart.y + dy });
				// Only move into a clear spot, sliding along whatever is in the way. A
				// chair already stuck somewhere it should not be may move anywhere.
				const id = selectedId;
				const stuck = seatHasCollision(sb, id);
				const next = firstClear(sb, p, c => stuck || !seatHasCollision(c, id));
				if (next) seats = seats.map(s => s.id === selectedId ? next : s);
			}
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
				// A table already overlapping something would otherwise be frozen in
				// place — every spot near it collides too. Let it move freely until clear.
				const id = selectedId;
				const stuck = tableHasCollision(orig, id, current);
				const next = firstClear(orig, elemSnapped, c => stuck || !tableHasCollision(c, id, current));
				if (next) tables = tables.map(t => t.id === selectedId ? next : t);
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
				if (tableHasCollision(orig, selectedId, current) || !tableHasCollision(candidate, selectedId, current)) {
					tables = tables.map(t => t.id === selectedId ? candidate : t);
				}
			}
		}
	}

	/** Where a dragged object goes: the target if it is clear, else as far as it can
	 *  get along one axis, so it slides along a wall or a neighbour instead of
	 *  stopping dead the moment the cursor passes into one. */
	function firstClear<T extends { x: number; y: number }>(orig: T, to: Point, ok: (c: T) => boolean): T | null {
		for (const c of [{ ...orig, x: to.x, y: to.y }, { ...orig, x: to.x }, { ...orig, y: to.y }]) {
			if ((c.x !== orig.x || c.y !== orig.y) && ok(c)) return c;
		}
		return null;
	}

	/** The corner handle of the selected room part under a point, if any (0 tl, 1 tr, 2 br, 3 bl). */
	function partCornerAt(raw: Point): number {
		if (selectedPart === null || !roomRects[selectedPart]) return -1;
		const rr = roomRects[selectedPart];
		const corners = [{ x: rr.x, y: rr.y }, { x: rr.x + rr.w, y: rr.y }, { x: rr.x + rr.w, y: rr.y + rr.h }, { x: rr.x, y: rr.y + rr.h }];
		const hitR = 9 / zoom;
		return corners.findIndex(c => Math.hypot(raw.x - c.x, raw.y - c.y) < hitR);
	}

	/** The points of the selected wall or zone, when it may be reshaped. */
	function selectedPolyPoints(): Point[] | null {
		if (!selectedId) return null;
		const w = wallsOff ? undefined : walls.find(x => x.id === selectedId);
		const z = zoneEditable(selectedId) ? zones.find(x => x.id === selectedId) : undefined;
		return w?.points ?? z?.points ?? null;
	}
	function setSelectedPoints(points: Point[]) {
		walls = walls.map(w => w.id === selectedId ? { ...w, points } : w);
		zones = zones.map(z => z.id === selectedId ? { ...z, points } : z);
	}
	/** Grab a corner of the selected shape — or, in drag-to-draw mode, put a new corner
	 *  on the edge under the pointer and grab that, so one press both adds and drags it. */
	function grabShapeHandle(e: PointerEvent, raw: Point): boolean {
		const pts = selectedPolyPoints();
		if (!pts) return false;
		const startDrag = (idx: number, at: Point) => {
			isVertexDragging = true; vertexDragIdx = idx; polyDragStart = raw; vertexOrigPos = { ...at };
			svgEl.setPointerCapture(e.pointerId);
		};
		const hitR = 8 / zoom; // vertex handle radius in world coords
		for (let vi = 0; vi < pts.length; vi++) {
			if (Math.hypot(raw.x - pts[vi].x, raw.y - pts[vi].y) < hitR) { pushUndo(); startDrag(vi, pts[vi]); return true; }
		}
		if (!rectDraw) return false;
		let best = -1, bestD = 7 / zoom, bestP: Point | null = null;
		for (let i = 0; i < pts.length; i++) {
			const a = pts[i], b = pts[(i + 1) % pts.length];
			const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
			if (l2 === 0) continue;
			const t = Math.max(0, Math.min(1, ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / l2));
			const q = { x: a.x + t * dx, y: a.y + t * dy };
			const d = Math.hypot(raw.x - q.x, raw.y - q.y);
			if (d < bestD) { best = i; bestD = d; bestP = q; }
		}
		if (best < 0 || !bestP) return false;
		pushUndo();
		const np = [...pts];
		np.splice(best + 1, 0, bestP);
		setSelectedPoints(np);
		startDrag(best + 1, bestP);
		return true;
	}
	/** The shapes the active drawing tool works on. */
	function toolShapes(): { id: string; points: Point[] }[] {
		if (tool === 'wall') return wallsOff ? [] : walls;
		if (tool === 'zone') return zones.filter(z => zoneEditable(z.id));
		return [];
	}
	/** With the Wall or Zone tool, a corner of ANY wall (or zone) can be grabbed and
	 *  dragged without switching tools; that shape becomes the selected one. */
	function grabAnyVertex(e: PointerEvent, raw: Point): boolean {
		const hitR = 8 / zoom;
		const shapes = toolShapes();
		for (let si = shapes.length - 1; si >= 0; si--) {
			const pts = shapes[si].points;
			for (let vi = 0; vi < pts.length; vi++) {
				if (Math.hypot(raw.x - pts[vi].x, raw.y - pts[vi].y) < hitR) {
					pushUndo();
					selectedId = shapes[si].id;
					isVertexDragging = true; vertexDragIdx = vi; polyDragStart = raw; vertexOrigPos = { ...pts[vi] };
					svgEl.setPointerCapture(e.pointerId);
					return true;
				}
			}
		}
		return false;
	}

	/** Finish a dragged-out rectangle: a real drag makes the shape, a click starts corners. */
	function finishRect() {
		const a = rectStart!, b = cursorPos;
		rectStart = null;
		if (!rectMoved) {
			const hit = [...toolShapes()].reverse().find(sh => pointInPoly(a, sh.points));
			if (hit) { selectedId = hit.id; return; }
			isDrawing = true; drawPts = [a]; return;
		}
		rectMoved = false;
		const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
		const min = Math.max(gridSnap || 0, 0.1);
		if (x1 - x0 < min || y1 - y0 < min) return;
		pushUndo();
		const points = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
		const id = crypto.randomUUID();
		if (tool === 'wall') walls = [...walls, { id, points }];
		else zones = [...zones, { id, points, color: zoneColor, label: `Zone ${zones.length + 1}` }];
		// Selected, so its edges take new corners straight away.
		selectedId = id;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && (e.altKey || spaceDown))) {
			e.preventDefault(); isPanning = true; svgEl.setPointerCapture(e.pointerId); return;
		}
		if (e.button !== 0) return;
		// Close any open popover on canvas click
		if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
		if (ctxMenu) { ctxMenu = null; return; }
		if (helpOpen) helpOpen = false;

		const raw = svgCoords(e), pos = snap(raw);

		if (readOnly) {
			// Looking only: a click still tells you what you are looking at.
			selectedId = null;
			for (let i = tables.length - 1; i >= 0; i--) if (tableHit(tables[i], raw)) { selectedId = tables[i].id; return; }
			for (let i = zones.length - 1; i >= 0; i--) if (pointInPoly(raw, zones[i].points)) { selectedId = zones[i].id; return; }
			return;
		}

		if (tool === 'wall' || tool === 'zone') {
			if (rectDraw && !isDrawing) {
				// The selected shape's corners and edges come first: reshape it in place.
				if (grabShapeHandle(e, raw) || grabAnyVertex(e, raw)) return;
				rectStart = pos; rectMoved = false;
				svgEl.setPointerCapture(e.pointerId);
				return;
			}
			if (!isDrawing) { isDrawing = true; drawPts = [pos]; return; }
			if (nearFirstPoint(pos)) {
				finishDrawing();
			} else { drawPts = [...drawPts, pos]; }
			return;
		}

		if (tool === 'pillar') {
			pushUndo();
			walls = [...walls, pillarAt(pos)];
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
			// In reservation mode only defined admin table types may be placed —
			// no freeform tables (which would otherwise use the tShape/tWidth fallback).
			if (tablesFromTypesOnly && !selectedType) return;
			if (selectedTypeExhausted) return;
			const st = selectedType;
			const useShape = st ? st.shape : tShape;
			const useWidth = st ? Number(st.width) : tWidth;
			const useHeight = st ? Number(st.height) : tHeight;
			const useRadius = st ? Number(st.radius) : Math.max(tWidth, tHeight) / 2;
			const useChairs = st ? Number(st.max_chairs) : tChairs;
			const sides = newTableSides(st);
			const t: TableObj = {
				id: crypto.randomUUID(), x: pos.x, y: pos.y,
				width: useWidth, height: useHeight, radius: useRadius,
				shape: useShape, chairs: useChairs, rotation: 0,
				// The number tells tables apart; the label says what kind of table it is.
				label: st ? st.name : '',
				num: nextTableNumber(allFloors),
				...sides,
				chairSpacing: tChairSpacing,
				assignments: Array(useShape === 'round' ? useChairs : (sides.chairsTop + sides.chairsBottom + sides.chairsLeft + sides.chairsRight)).fill(null),
				typeId: st?.id,
			};
			const snap = snapTables(tables);
			// The tool stays active so the next click places the next table.
			if (!tableHasCollision(t, undefined, snap)) { pushUndo(); tables = [...tables, t]; }
			return;
		}

		if (tool === 'chair') {
			const seat: SeatObj = { id: crypto.randomUUID(), x: pos.x, y: pos.y, rotation: 0, assignment: null };
			// Only drop the chair if it clears walls, tables, bounds and other chairs.
			if (seatHasCollision(seat)) return;
			pushUndo();
			seats = [...seats, seat];
			return;
		}

		if (tool === 'eraser') {
			for (let i = seats.length - 1; i >= 0; i--) {
				if (Math.hypot(raw.x - seats[i].x, raw.y - seats[i].y) <= SEAT_R) { pushUndo(); seats = seats.filter((_, j) => j !== i); return; }
			}
			for (let i = tables.length - 1; i >= 0; i--) {
				if (tableHit(tables[i], raw)) { pushUndo(); tables = tables.filter((_, j) => j !== i); return; }
			}
			for (let i = zones.length - 1; i >= 0; i--) {
				if (zoneEditable(zones[i].id) && pointInPoly(raw, zones[i].points)) { pushUndo(); zones = zones.filter((_, j) => j !== i); return; }
			}
			if (!wallsOff) {
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
					// A new part must add floor (one drawn wholly inside the room is a
					// part that does nothing, and a trap later when it is moved), and must
					// join the room: overlap it or share a doorway's width of edge.
					if (rectCovered({ x, y, w, h }, roomRects)) noticeRoom(tr.editor.roomPartInside);
					else if (partsConnected([...roomRects, { x, y, w, h }])) {
						pushUndo();
						roomRects = [...roomRects, { x, y, w, h }];
					} else noticeRoom(tr.editor.roomNotJoined);
				}
				// Stay in the tool: the next rectangle joins this one (an L, a U…).
				boundsStart = null;
			}
			return;
		}

		if (tool === 'select') {
			// A corner handle of the selected room part: resize.
			if (!boundsLocked && step === 'room') {
				const corner = partCornerAt(raw);
				if (corner >= 0 && selectedPart !== null) {
					pushUndo();
					partDrag = { idx: selectedPart, kind: 'resize', corner, start: raw, orig: { ...roomRects[selectedPart] } };
					svgEl.setPointerCapture(e.pointerId);
					return;
				}
			}
			// Corners (and, in drag-to-draw mode, edges) of the selected wall or zone first
			if (grabShapeHandle(e, raw)) return;

			for (let i = tables.length - 1; i >= 0; i--) {
				const t = tables[i];
				// Check chair click first (opens popover, no drag)
				const ci = findClickedChair(t, raw);
				if (ci >= 0) {
					if (!allowGuests) { selectedId = t.id; selectedPart = null; return; }
					selectedPart = null;
					openSeatPopover(t, ci);
					return;
				}
				// Then table body (drag — unless the venue fixes where tables stand)
				if (tableBodyHit(t, raw)) {
					if (lockTables) { selectedId = t.id; selectedPart = null; return; }
					pushUndo(); selectedId = t.id; selectedPart = null; isDragging = true; dragStart = raw; elemStart = { x: t.x, y: t.y }; return;
				}
			}
			// Zones — select + drag (the hall's own zones are part of the room here)
			if (!zonesOff) {
				for (let i = zones.length - 1; i >= 0; i--) {
					if (zoneEditable(zones[i].id) && pointInPoly(raw, zones[i].points)) {
						pushUndo(); selectedId = zones[i].id; selectedPart = null;
						isPolyDragging = true; polyDragStart = raw;
						polyOrigPoints = zones[i].points.map(p => ({ ...p }));
						svgEl.setPointerCapture(e.pointerId);
						return;
					}
				}
			}
			// Walls — select + drag
			if (!wallsOff) {
				for (let i = walls.length - 1; i >= 0; i--) {
					if (pointInPoly(raw, walls[i].points)) {
						pushUndo(); selectedId = walls[i].id; selectedPart = null;
						isPolyDragging = true; polyDragStart = raw;
						polyOrigPoints = walls[i].points.map(p => ({ ...p }));
						svgEl.setPointerCapture(e.pointerId);
						return;
					}
				}
			}
			// Room parts — in the room step, the floor itself can be picked up.
			if (!boundsLocked && step === 'room') {
				for (let i = roomRects.length - 1; i >= 0; i--) {
					const rr = roomRects[i];
					if (raw.x >= rr.x && raw.x <= rr.x + rr.w && raw.y >= rr.y && raw.y <= rr.y + rr.h) {
						pushUndo();
						selectedId = null; selectedPart = i;
						partDrag = { idx: i, kind: 'move', corner: -1, start: raw, orig: { ...rr } };
						svgEl.setPointerCapture(e.pointerId);
						return;
					}
				}
			}
			selectedId = null; selectedPart = null;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (rectStart) finishRect();
		// A press on a seat that never moved → open its assignment popover.
		if (seatClickCandidate) {
			const c = seatClickCandidate; seatClickCandidate = null;
			if (allowGuests) { chairPopover = { seatId: c.id, x: c.x, y: c.y }; guestSearch = ''; }
		}
		isPanning = isDragging = isRotating = isPolyDragging = isVertexDragging = false;
		vertexDragIdx = -1;
		partDrag = null;
		svgEl?.releasePointerCapture(e.pointerId);
	}

	// ─── Right-click menu ─────────────────────────────────────────────────────
	type CtxItem = { label: string; run: () => void; danger?: boolean; disabled?: boolean; kbd?: string };
	let ctxMenu = $state<{ x: number; y: number; title: string; items: CtxItem[] } | null>(null);

	function removeVertex(id: string, vi: number) {
		const sh = walls.find(w => w.id === id) ?? zones.find(z => z.id === id);
		if (!sh || sh.points.length <= 3) return;
		pushUndo();
		const points = sh.points.filter((_, i) => i !== vi);
		walls = walls.map(w => w.id === id ? { ...w, points } : w);
		zones = zones.map(z => z.id === id ? { ...z, points } : z);
	}
	function insertVertex(id: string, edge: number, at: Point) {
		const sh = walls.find(w => w.id === id) ?? zones.find(z => z.id === id);
		if (!sh) return;
		pushUndo();
		const points = [...sh.points];
		points.splice(edge + 1, 0, snap(at));
		walls = walls.map(w => w.id === id ? { ...w, points } : w);
		zones = zones.map(z => z.id === id ? { ...z, points } : z);
		selectedId = id;
	}
	function duplicateShape(id: string) {
		const off = (pts: Point[]) => pts.map(q => ({ x: q.x + 1, y: q.y + 1 }));
		const w = walls.find(x => x.id === id), z = zones.find(x => x.id === id);
		pushUndo();
		const nid = crypto.randomUUID();
		if (w) walls = [...walls, { ...w, id: nid, points: off(w.points) }];
		if (z) zones = [...zones, { ...z, id: nid, points: off(z.points), label: z.label ? `${z.label} 2` : z.label }];
		selectedId = nid;
	}
	function removeShape(id: string) {
		pushUndo();
		walls = walls.filter(w => w.id !== id);
		zones = zones.filter(z => z.id !== id);
		if (selectedId === id) selectedId = null;
	}
	/** A copy of a table next to it, wherever the first clear spot is. */
	function duplicateTable(t: TableObj): boolean {
		const current = snapTables(tables);
		const step = Math.max(Number(t.width), Number(t.radius) * 2, 1) + 1;
		for (const [dx, dy] of [[step, 0], [0, step], [-step, 0], [0, -step], [step, step], [-step, step], [step, -step], [-step, -step]]) {
			// The copy keeps the kind of table (its label) and gets a number of its own.
			const c: TableObj = { ...t, id: crypto.randomUUID(), x: snap({ x: Number(t.x) + dx, y: 0 }).x, y: snap({ x: 0, y: Number(t.y) + dy }).y,
				label: /^T\d+$/.test((t.label ?? '').trim()) ? '' : t.label, num: nextTableNumber(allFloors),
				assignments: Array(totalChairs(t)).fill(null) };
			if (!tableHasCollision(c, undefined, current)) { pushUndo(); tables = [...tables, c]; selectedId = c.id; return true; }
		}
		return false;
	}
	function rotateTable(id: string, by: number) {
		pushUndo();
		tables = tables.map(t => t.id === id ? { ...t, rotation: ((Number(t.rotation) + by + 540) % 360) - 180 } : t);
	}

	/** What is under a world point, most specific first. */
	function ctxItemsAt(raw: Point): { title: string; items: CtxItem[] } | null {
		const hitR = 8 / zoom;
		// While drawing a polygon, the menu is about the drawing.
		if (isDrawing) return { title: tr.editor.ctxDrawing, items: [
			{ label: tr.editor.closeShape, kbd: 'Enter', disabled: drawPts.length < 3, run: finishDrawing },
			{ label: tr.editor.ctxUndoCorner, disabled: drawPts.length < 2, run: () => { drawPts = drawPts.slice(0, -1); } },
			{ label: tr.common.cancel, kbd: 'Esc', run: cancelDrawing },
		] };
		if (readOnly) return { title: tr.editor.readOnlyStep, items: [{ label: tr.editor.fitRoom, kbd: '⇧1', run: fitToRoom }] };

		const shapes: { id: string; points: Point[]; kind: 'wall' | 'zone' }[] = [
			...zones.filter(z => zoneEditable(z.id)).map(z => ({ id: z.id, points: z.points, kind: 'zone' as const })),
			...(wallsOff ? [] : walls.map(w => ({ id: w.id, points: w.points, kind: 'wall' as const }))),
		];
		const shapeItems = (sh: { id: string; kind: 'wall' | 'zone' }): CtxItem[] => [
			{ label: tr.editor.ctxDuplicate, run: () => duplicateShape(sh.id) },
			{ label: sh.kind === 'wall' ? tr.editor.deleteWall : tr.editor.deleteZone, danger: true, kbd: 'Del', run: () => removeShape(sh.id) },
		];
		// A corner — the selected shape's first, then any.
		const ordered = [...shapes].sort((a, b) => (a.id === selectedId ? -1 : b.id === selectedId ? 1 : 0));
		for (const sh of ordered) {
			const vi = sh.points.findIndex(q => Math.hypot(raw.x - q.x, raw.y - q.y) < hitR);
			if (vi >= 0) {
				selectedId = sh.id;
				return { title: tr.editor.ctxCorner(vi + 1, sh.points.length), items: [
					{ label: tr.editor.ctxDeleteCorner, danger: true, disabled: sh.points.length <= 3, run: () => removeVertex(sh.id, vi) },
					...shapeItems(sh),
				] };
			}
		}
		// A standalone chair
		for (let i = seats.length - 1; i >= 0; i--) {
			const st = seats[i];
			if (Math.hypot(raw.x - st.x, raw.y - st.y) > SEAT_R) continue;
			selectedId = st.id;
			const items: CtxItem[] = [];
			if (allowGuests) {
				items.push({ label: tr.editor.assign, run: () => { chairPopover = { seatId: st.id, x: wx(st.x), y: wy(st.y) }; guestSearch = ''; } });
				if (st.assignment) items.push({ label: tr.editor.ctxClearSeat, run: () => clearSeat({ seatId: st.id }) });
			}
			if (!lockTables) {
				items.push({ label: tr.editor.ctxRotate90, run: () => { pushUndo(); seats = seats.map(x => x.id === st.id ? { ...x, rotation: (Number(x.rotation) + 90) % 360 } : x); } });
				items.push({ label: tr.editor.ctxDeleteChair, danger: true, kbd: 'Del', run: () => { pushUndo(); seats = seats.filter(x => x.id !== st.id); selectedId = null; } });
			}
			if (!items.length) break;
			return { title: tr.editor.chairRef(i + 1), items };
		}
		// A table chair, then the table itself
		for (let i = tables.length - 1; i >= 0; i--) {
			const t = tables[i];
			const ci = allowGuests ? findClickedChair(t, raw) : -1;
			const onBody = tableBodyHit(t, raw);
			if (ci < 0 && !onBody) continue;
			selectedId = t.id;
			const items: CtxItem[] = [];
			if (ci >= 0) {
				items.push({ label: tr.editor.assign, run: () => openSeatPopover(t, ci) });
				if (t.assignments[ci]) items.push({ label: tr.editor.ctxClearSeat, run: () => clearSeat({ tableId: t.id, chairIdx: ci }) });
			}
			const tt = t.typeId ? tableTypes?.find(x => x.id === t.typeId) : null;
			if (!lockTables) items.push(
				{ label: tr.editor.ctxRotate90, run: () => rotateTable(t.id, 90) },
				{ label: tr.editor.ctxDuplicate, disabled: !!tt && typeLeft(tt) <= 0, run: () => { duplicateTable(t); } },
			);
			if (allowGuests && t.assignments.some(Boolean)) items.push({ label: tr.editor.clearSeats, run: () => clearTableSeats(t.id) });
			if (!lockTables) items.push({ label: tr.editor.deleteTable, danger: true, kbd: 'Del', run: () => { pushUndo(); tables = tables.filter(x => x.id !== t.id); selectedId = null; } });
			if (!items.length) break;
			return { title: ci >= 0 ? tr.editor.seatRef(tableName(t), ci + 1) : tableName(t), items };
		}
		// An edge of a shape: add a corner there
		for (const sh of ordered) {
			for (let i = 0; i < sh.points.length; i++) {
				const a = sh.points[i], b = sh.points[(i + 1) % sh.points.length];
				const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
				if (!l2) continue;
				const u = Math.max(0, Math.min(1, ((raw.x - a.x) * dx + (raw.y - a.y) * dy) / l2));
				const q = { x: a.x + u * dx, y: a.y + u * dy };
				if (Math.hypot(raw.x - q.x, raw.y - q.y) > 7 / zoom) continue;
				selectedId = sh.id;
				return { title: sh.kind === 'wall' ? tr.editor.wall : (zones.find(z => z.id === sh.id)?.label || tr.editor.zoneOptions), items: [
					{ label: tr.editor.ctxAddCorner, run: () => insertVertex(sh.id, i, q) },
					...shapeItems(sh),
				] };
			}
		}
		// Inside a zone or a wall
		for (const sh of ordered) {
			if (!pointInPoly(raw, sh.points)) continue;
			selectedId = sh.id;
			return { title: sh.kind === 'wall' ? tr.editor.wall : (zones.find(z => z.id === sh.id)?.label || tr.editor.zoneOptions), items: shapeItems(sh) };
		}
		// A part of the room
		if (!boundsLocked) {
			for (let i = roomRects.length - 1; i >= 0; i--) {
				const r = roomRects[i];
				if (raw.x < r.x || raw.x > r.x + r.w || raw.y < r.y || raw.y > r.y + r.h) continue;
				if (step !== 'room') break;
				selectedId = null; selectedPart = i;
				return { title: tr.editor.roomPart(i + 1), items: [
					{ label: tr.editor.ctxDuplicate, run: () => { pushUndo(); roomRects = [...roomRects, { ...r, x: r.x + r.w }]; } },
					{ label: tr.editor.removePart, danger: true, disabled: !partsConnected(roomRects.filter((_, j) => j !== i)), run: () => { removeRoomPart(i); } },
				] };
			}
		}
		// Empty canvas: the view, and what the current tool can do here
		const items: CtxItem[] = [];
		if (tool === 'pillar') items.push({ label: tr.editor.ctxPillarHere, run: () => { pushUndo(); walls = [...walls, pillarAt(snap(raw))]; } });
		if (tool === 'chair') items.push({ label: tr.editor.ctxChairHere, run: () => { const st: SeatObj = { id: crypto.randomUUID(), ...snap(raw), rotation: 0, assignment: null }; if (!seatHasCollision(st)) { pushUndo(); seats = [...seats, st]; } } });
		if (tool !== 'select') items.push({ label: tr.editor.ctxBackToSelect, kbd: 'V', run: () => pickTool('select') });
		items.push({ label: tr.editor.fitRoom, kbd: '⇧1', run: fitToRoom });
		items.push({ label: tr.editor.ctxMeasureFrom, run: () => { pickTool('measure'); measureStart = snap(raw); measureEnd = null; } });
		selectedId = null;
		return { title: tr.editor.ctxCanvas, items };
	}

	function onContextMenu(e: MouseEvent) {
		e.preventDefault();
		chairPopover = null; helpOpen = false;
		const r = svgEl.getBoundingClientRect();
		const found = ctxItemsAt(svgCoords(e));
		if (!found) { ctxMenu = null; return; }
		// Keep the menu inside the canvas.
		const w = 230, h = 40 + found.items.length * 32;
		const x = Math.min(e.clientX - r.left, r.width - w - 8);
		const y = Math.min(e.clientY - r.top, r.height - h - 8);
		ctxMenu = { x: Math.max(8, x), y: Math.max(8, y), ...found };
	}
	function runCtx(item: CtxItem) {
		if (item.disabled) return;
		ctxMenu = null;
		item.run();
	}

	function onDblClick(e: MouseEvent) {
		if ((tool === 'wall' || tool === 'zone') && isDrawing && drawPts.length >= 3) { finishDrawing(); return; }
		// Double-clicking a corner of the selected shape removes it (a shape keeps three).
		const pts = selectedPolyPoints();
		if (!pts || pts.length <= 3) return;
		const raw = svgCoords(e);
		const vi = pts.findIndex(p => Math.hypot(raw.x - p.x, raw.y - p.y) < 8 / zoom);
		if (vi < 0) return;
		pushUndo();
		setSelectedPoints(pts.filter((_, i) => i !== vi));
	}

	function finishDrawing() {
		if (drawPts.length < 3) return;
		pushUndo();
		if (tool === 'wall') walls = [...walls, { id: crypto.randomUUID(), points: [...drawPts] }];
		else zones = [...zones, { id: crypto.randomUUID(), points: [...drawPts], color: zoneColor, label: `Zone ${zones.length + 1}` }];
		drawPts = []; isDrawing = false;
	}

	function cancelDrawing() { drawPts = []; isDrawing = false; }

	function onWheel(e: WheelEvent) {
		ctxMenu = null;
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

	// ─── Guests dragged from the list onto a chair ────────────────────────────
	/** The chair (table chair or standalone seat) under a screen point, with a generous radius. */
	function chairAt(clientX: number, clientY: number): SeatTarget | null {
		const r = svgEl?.getBoundingClientRect();
		if (!r || clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
		const p = { x: sx(clientX - r.left), y: sy(clientY - r.top) };
		for (let i = tables.length - 1; i >= 0; i--) {
			const ci = findClickedChair(tables[i], p, 0.34);
			if (ci >= 0) return { tableId: tables[i].id, chairIdx: ci };
		}
		for (let i = seats.length - 1; i >= 0; i--) {
			if (Math.hypot(p.x - seats[i].x, p.y - seats[i].y) <= 0.34) return { seatId: seats[i].id };
		}
		return null;
	}
	function startGuestDrag(e: PointerEvent, id: string) {
		if (e.button !== 0) return;
		e.preventDefault();
		dragGuest = { id, x: e.clientX, y: e.clientY };
		window.addEventListener('pointermove', onGuestDragMove);
		window.addEventListener('pointerup', onGuestDragEnd, { once: true });
	}
	function onGuestDragMove(e: PointerEvent) {
		if (!dragGuest) return;
		dragGuest = { ...dragGuest, x: e.clientX, y: e.clientY };
		dragTarget = chairAt(e.clientX, e.clientY);
	}
	function onGuestDragEnd(e: PointerEvent) {
		window.removeEventListener('pointermove', onGuestDragMove);
		const target = chairAt(e.clientX, e.clientY);
		if (target && dragGuest) {
			assignGuestTo(dragGuest.id, target);
			if (target.tableId) selectedId = target.tableId;
		}
		dragGuest = null; dragTarget = null;
	}
	const dragGuestRecord = $derived(dragGuest ? guests.find(g => g.id === dragGuest!.id) ?? null : null);

	// ─── Keyboard ─────────────────────────────────────────────────────────────
	function deleteSelection() {
		if (selectedPart !== null && !boundsLocked) {
			removeRoomPart(selectedPart);
			return;
		}
		if (!selectedId) return;
		pushUndo();
		if (!lockTables) {
			tables = tables.filter(t => t.id !== selectedId);
			seats = seats.filter(s => s.id !== selectedId);
		}
		if (!wallsOff) walls = walls.filter(w => w.id !== selectedId);
		zones = zones.filter(z => z.id !== selectedId || !zoneEditable(z.id));
		selectedId = null;
	}

	/** Inputs that take no typing: focus left on one (the drag-to-draw checkbox) must
	 *  not switch the canvas shortcuts off. */
	const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file']);
	function isTyping(e: KeyboardEvent): boolean {
		const el = e.target as HTMLElement | null;
		if (!el) return false;
		if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
		return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
	}

	function onKeyDown(e: KeyboardEvent) {
		// Don't run canvas shortcuts (Delete/Backspace removes a table, etc.) while
		// the user is typing in a field — let the input handle the key normally.
		if (isTyping(e)) return;
		if (e.key === ' ' && !e.repeat) { spaceDown = true; e.preventDefault(); return; }
		if (e.key === ' ') { e.preventDefault(); return; }
		if (e.key === 'Escape') {
			if (ctxMenu) { ctxMenu = null; return; }
			if (helpOpen) { helpOpen = false; return; }
			if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
			if (renamingIdx !== null) { renamingIdx = null; return; }
			if (confirmRemoveIdx !== null) { confirmRemoveIdx = null; return; }
			if (measureStart || measureEnd) { measureStart = null; measureEnd = null; return; }
			if (boundsStart) { boundsStart = null; return; }
			if (rectStart) { rectStart = null; rectMoved = false; return; }
			if (isDrawing) { cancelDrawing(); return; }
			if (tool !== 'select') { tool = 'select'; return; }
			selectedId = null; selectedPart = null;
			return;
		}
		if (e.key === 'Enter' && isDrawing && drawPts.length >= 3) { finishDrawing(); return; }
		if ((e.key === 'Delete' || e.key === 'Backspace') && !isDrawing && !chairPopover && !readOnly) { deleteSelection(); return; }
		// Undo / Redo
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
		if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		// By the physical key: Shift+1 is "!" on a US keyboard, "1" on a Slovak one.
		if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1')) { fitToRoom(); return; }
		if (e.key.toLowerCase() === 'd' && !e.shiftKey) { showDims = !showDims; return; }
		// Single-key tools, only the ones this step offers.
		const t = toolForKey(e.key);
		if (t && !readOnly && stepTools.includes(t)) { pickTool(t); }
	}
	function onKeyUp(e: KeyboardEvent) {
		if (e.key === ' ') spaceDown = false;
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
	/** A number field whose value was capped: show the capped value. Svelte leaves the
	 *  typed text when the bound value comes out unchanged, so a field could read 12
	 *  on a table that only takes 10. An emptied field is left to be typed into. */
	function showClamped(el: HTMLInputElement, v: number) {
		if (el.value !== '' && String(v) !== el.value) el.value = String(v);
	}
	/** One side's chair count: on a table, as `updateTable` allowed it (a table type
	 *  caps the total); on the new-table settings, as typed. */
	function setSideChairs(e: Event, key: 'chairsTop' | 'chairsBottom' | 'chairsLeft' | 'chairsRight', T: TableObj | null, setNew: (v: number) => void) {
		const el = e.target as HTMLInputElement;
		let v = Math.max(0, Math.floor(+el.value || 0));
		if (T) {
			updateTable({ [key]: v });
			v = Number(tables.find(t => t.id === T.id)?.[key]) || 0;
		} else setNew(v);
		showClamped(el, v);
	}

	function updateZone(patch: Partial<ZoneObj>) {
		zones = zones.map(z => z.id === selectedId ? { ...z, ...patch } : z);
	}
	function updateSeat(patch: Partial<SeatObj>) {
		seats = seats.map(s => s.id === selectedId ? { ...s, ...patch } : s);
	}

	// ─── Constants ────────────────────────────────────────────────────────────
	const ZONE_PRESETS = ['#a78bfa','#22d3ee','#34d399','#fb923c','#f472b6','#facc15','#60a5fa','#f87171'];

	// Word-wrap a zone label to roughly fit the zone's width (SVG text has no
	// auto-wrap). Falls back to hard-breaking a single over-long word.
	function wrapLabel(text: string, maxChars: number): string[] {
		const words = text.trim().split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		let cur = '';
		for (const w of words) {
			if (!cur) cur = w;
			else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
			else { lines.push(cur); cur = w; }
		}
		if (cur) lines.push(cur);
		// Only hard-break a genuinely long single word — never split normal words.
		const hard = Math.max(maxChars, 16);
		const out: string[] = [];
		for (const l of lines) {
			if (l.length <= hard) out.push(l);
			else for (let i = 0; i < l.length; i += hard) out.push(l.slice(i, i + hard));
		}
		return out.length ? out : [text];
	}

	// ─── Measurements ─────────────────────────────────────────────────────────
	function polyAreaM2(pts: Point[]): number {
		return Math.abs(pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2);
	}
	/** Edge labels for a closed shape: the longest edges first, short ones left out. */
	function edgeDims(pts: Point[], max = 12, min = 1): { x: number; y: number; len: number }[] {
		if (pts.length < 2) return [];
		const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
		const out = pts.map((p, i) => {
			const q = pts[(i + 1) % pts.length];
			const len = Math.hypot(q.x - p.x, q.y - p.y);
			const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
			// Nudge the label away from the shape's middle, so it sits just outside the edge.
			const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy) || 1;
			return { x: mx + (dx / d) * (14 / zoom), y: my + (dy / d) * (14 / zoom), len };
		}).filter(e => e.len >= min);
		return out.sort((a, b) => b.len - a.len).slice(0, max);
	}
	/** The measurement labels (screen pixels), most telling first; one that would cover
	 *  another is left out rather than printed on top of it. */
	type DimLabel = { x: number; y: number; text: string; size: number; cls: string };
	const dimLabels = $derived.by((): DimLabel[] => {
		if (!dimsOn) return [];
		const out: DimLabel[] = [];
		const reserved: LabelBox[] = [];
		if (bounds) {
			// The overall width above the room and height left of it are always shown.
			const top = wy(bounds.y) - 26, left = wx(bounds.x) - 26;
			reserved.push(labelBox({ x: wx(bounds.x + bounds.w / 2), y: top - 11, text: `${bounds.w.toFixed(2)} m`, size: 12 }));
			const hb = labelBox({ x: 0, y: 0, text: `${bounds.h.toFixed(2)} m`, size: 12 });
			const cy = wy(bounds.y + bounds.h / 2), half = (hb.x1 - hb.x0) / 2;
			reserved.push({ x0: left - 18, y0: cy - half, x1: left, y1: cy + half });
			// Each stretch of an L- or U-shaped outline
			if (roomRects.length > 1) {
				for (const [a, b] of roomEdges) {
					const len = Math.hypot(b.x - a.x, b.y - a.y);
					if (len >= 1) out.push({ x: wx((a.x + b.x) / 2), y: wy((a.y + b.y) / 2) + (a.y === b.y ? -10 : 0), text: `${len.toFixed(2)} m`, size: 11, cls: 'dim-label dim-edge dim-room' });
				}
			}
		}
		for (const wall of walls) {
			for (const d of edgeDims(wall.points, wall.points.length > 12 ? 8 : 12)) out.push({ x: wx(d.x), y: wy(d.y), text: d.len.toFixed(2), size: 11, cls: 'dim-label dim-edge' });
		}
		for (const zone of zones) {
			const xs = zone.points.map(p => p.x), ys = zone.points.map(p => p.y);
			out.push({
				x: wx(xs.reduce((a, v) => a + v, 0) / xs.length), y: wy(ys.reduce((a, v) => a + v, 0) / ys.length) + 14,
				text: `${polyAreaM2(zone.points).toFixed(1)} m² · ${(Math.max(...xs) - Math.min(...xs)).toFixed(1)} × ${(Math.max(...ys) - Math.min(...ys)).toFixed(1)} m`,
				size: 11, cls: 'dim-label dim-edge'
			});
		}
		for (const zone of zones) {
			for (const d of edgeDims(zone.points, 8)) out.push({ x: wx(d.x), y: wy(d.y), text: d.len.toFixed(2), size: 10, cls: 'dim-label dim-edge dim-zone' });
		}
		for (const t of tables) {
			out.push({
				x: wx(Number(t.x)), y: wy(Number(t.y)) + ws(t.shape === 'round' ? Number(t.radius) : Number(t.height) / 2) + 22,
				text: `${t.shape === 'round' ? `⌀ ${(Number(t.radius) * 2).toFixed(1)}` : `${Number(t.width).toFixed(1)} × ${Number(t.height).toFixed(1)}`} m`,
				size: 11, cls: 'dim-label dim-edge'
			});
		}
		return placeLabels(out, reserved);
	});

	const roomPerimeter = $derived(roomEdges.reduce((a, [p, q]) => a + Math.hypot(q.x - p.x, q.y - p.y), 0));
	const zonesArea = $derived(zones.reduce((a, z) => a + polyAreaM2(z.points), 0));

	function closeSnapDrop(e: MouseEvent) {
		if (!(e.target as HTMLElement).closest('.custom-select')) snapDropOpen = false;
	}

	function setRectDraw(on: boolean) {
		rectDraw = on; rectStart = null; rectMoved = false; cancelDrawing();
		try { localStorage.setItem(RECT_KEY, on ? '1' : '0'); } catch { /* private mode */ }
	}

	const zoomPercent = $derived(Math.round((zoom / 60) * 100));
	const saveStateText = $derived(saveState === 'saved' ? tr.editor.saved : saveState === 'saving' ? tr.editor.saving : saveState === 'dirty' ? tr.editor.unsaved : '');

	// ─── Small screens ───────────────────────────────────────────────────────
	// Three columns do not fit a phone: the canvas came out 0 px wide and the save
	// controls were cut off. Below a tablet's width the editor shows the plan, read
	// only, and says where it can be edited.
	let narrow = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 760px)');
		narrow = mq.matches;
		const onNarrow = (e: MediaQueryListEvent) => { narrow = e.matches; if (!e.matches) requestAnimationFrame(() => fitToRoom()); };
		mq.addEventListener('change', onNarrow);
		return () => mq.removeEventListener('change', onNarrow);
	});

	onMount(() => {
		uiStore.setSidebarRail(true);
		try { tipsSeen = JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]'); } catch { tipsSeen = []; }
		try { const v = localStorage.getItem(RECT_KEY); if (v !== null) rectDraw = v === '1'; } catch { /* private mode */ }
		tipsLoaded = true;
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		window.addEventListener('click', closeSnapDrop, true);
		return () => {
			uiStore.setSidebarRail(false);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			window.removeEventListener('click', closeSnapDrop, true);
			window.removeEventListener('pointermove', onGuestDragMove);
		};
	});
</script>

<!-- ─── Floor tabs and help, at the right end of the step strip ──────────── -->
{#snippet stripRight()}
	<div class="floors" role="tablist" aria-label={tr.hallAdmin.floors}>
		{#each floors as floor, i (floor.id)}
			{#if renamingIdx === i}
				<!-- svelte-ignore a11y_autofocus -->
				<input class="floor-rename" type="text" bind:value={renameValue} aria-label={tr.editor.floorName} autofocus
					onkeydown={(e) => { if (e.key === 'Enter') commitRename(); else if (e.key === 'Escape') renamingIdx = null; }}
					onblur={commitRename} />
			{:else}
				<button type="button" class="floor-tab" class:active={i === activeFloorIdx} role="tab" aria-selected={i === activeFloorIdx}
					title={i === activeFloorIdx && !lockFloors ? tr.editor.renameFloor : floor.name}
					onclick={() => { if (i !== activeFloorIdx) loadFloor(i); else startRename(i); }}>
					{floor.name}
					{#if i === activeFloorIdx && !lockFloors}
						<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
					{/if}
				</button>
			{/if}
		{/each}
		{#if !lockFloors}
			<button type="button" class="floor-tab floor-tab-add" onclick={addFloor} title={tr.editor.addFloor} aria-label={tr.editor.addFloor}>+</button>
			{#if floors.length > 1}
				{#if confirmRemoveIdx === activeFloorIdx}
					<span class="floor-confirm" role="alertdialog">
						{tr.editor.removeFloorConfirm(floors[activeFloorIdx].name)}
						<button type="button" class="fc-yes" onclick={() => removeFloor(activeFloorIdx)}>{tr.editor.confirmRemove}</button>
						<button type="button" class="fc-no" onclick={() => confirmRemoveIdx = null}>{tr.common.cancel}</button>
					</span>
				{:else}
					<button type="button" class="floor-tab floor-tab-del" onclick={() => confirmRemoveIdx = activeFloorIdx} title={tr.editor.removeFloor} aria-label={tr.editor.removeFloor}>✕</button>
				{/if}
			{/if}
		{/if}
	</div>
	<button type="button" class="help-btn" class:on={helpOpen} onclick={() => helpOpen = !helpOpen} aria-label={tr.editor.help} aria-expanded={helpOpen} title={tr.editor.help}>?</button>
{/snippet}

<!-- ─── Layout ─────────────────────────────────────────────────────────────── -->
<div class="app" class:narrow-app={narrow}>
	{#if narrow}
	<div class="narrow">
		<div class="narrow-msg" role="note">
			<b>{tr.editor.smallScreenTitle}</b>
			<p>{tr.editor.smallScreenText}</p>
		</div>
		{#each allFloors as f (f.id)}
			<section class="narrow-floor">
				{#if allFloors.length > 1}<h3>{f.name}</h3>{/if}
				<FloorplanPrint floor={f} {guests} numbers={tableNums} />
			</section>
		{/each}
		{#if allowGuests && guests.length}<p class="narrow-facts">{tr.editor.seatedOf(totalAssigned, guests.length)}</p>{/if}
		{#if printHref}<a class="btn-sm narrow-print" href={printHref}>{tr.editor.printPlan}</a>{/if}
	</div>
	{:else}
	<StepStrip steps={stepItems} onPick={goStep}
		note={editorMode === 'room' ? tr.editor.stepsNoteRoom : editorMode === 'seating' ? tr.editor.stepsNoteSeating : tr.editor.stepsNoteLocked}
		right={stripRight} />

	<div class="body">
		<!-- Left column: the step's tools, or the guest list in the guests step -->
		{#if step === 'guests' && allowGuests}
			<GuestList guests={guestRows} {existingGroups} draggingId={dragGuest?.id ?? null} {importMessage}
				onAdd={addGuest} onRemove={removeGuest} onNote={updateGuestNote} onImport={importGuests}
				onDragStart={startGuestDrag} onAutoSeat={autoSeatRest} onClearAll={clearAllAssignments} />
		{:else}
			<ToolCards title={tr.editor.stepOf(stepIndex + 1, steps.length) + ' · ' + stepLabel(step)}
				tools={toolCards} active={tool} onPick={pickTool}
				canUndo={undoStack.length > 0} canRedo={redoStack.length > 0} onUndo={undo} onRedo={redo}
				undoLabel={tr.editor.undo} redoLabel={tr.editor.redo}>
				{#if step === 'tables' && tablesFromTypesOnly && !(tableTypes && tableTypes.length)}
					<!-- Only staff can define table types; a client is told who can help. -->
					<p class="tool-note">{audience === 'client' ? tr.editor.tablesNeedTypesClient : tr.editor.tablesNeedTypes}</p>
				{:else if step === 'walls'}
					{#if tool === 'pillar'}
						<!-- The next pillar: how big, and square or round. -->
						<div class="tool-opts">
							<label class="opt-field">
								<span>{tr.editor.pillarSize}</span>
								<input type="number" min="0.1" max="3" step="0.05" value={pillarSize}
									oninput={(e) => { const el = e.target as HTMLInputElement; const v = Math.min(3, Math.max(0.1, +el.value || 0.5)); pillarSize = v; }} />
							</label>
							<div class="seg" role="group" aria-label={tr.editor.shape}>
								<button type="button" class:on={!pillarRound} aria-pressed={!pillarRound} onclick={() => pillarRound = false}>{tr.editor.pillarSquare}</button>
								<button type="button" class:on={pillarRound} aria-pressed={pillarRound} onclick={() => pillarRound = true}>{tr.editor.round}</button>
							</div>
						</div>
					{/if}
					<label class="mode-switch"><input type="checkbox" checked={rectDraw} onchange={(e) => setRectDraw((e.target as HTMLInputElement).checked)} />{tr.editor.rectDrawMode}</label>
					<p class="tool-note">{tr.editor.wallsOptional}</p>
				{:else if step === 'zones'}
					<label class="mode-switch"><input type="checkbox" checked={rectDraw} onchange={(e) => setRectDraw((e.target as HTMLInputElement).checked)} />{tr.editor.rectDrawMode}</label>
				{:else if step === 'check'}
					<p class="tool-note">{tr.editor.instrCheck}</p>
				{/if}
			</ToolCards>
		{/if}

		<!-- Canvas -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<main class="canvas-wrap" role="application" class:rulers={showRulers}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg bind:this={svgEl} class="map-svg" data-zoom={zoom.toFixed(3)} data-panx={panX.toFixed(1)} data-pany={panY.toFixed(1)}
				class:c-cross={!readOnly && (tool === 'wall' || tool === 'zone' || tool === 'table' || tool === 'chair' || tool === 'bounds' || tool === 'measure' || tool === 'pillar')}
				class:c-cell={tool === 'eraser'}
				class:c-grab={spaceDown || isPanning}
				onpointermove={onPointerMove} onpointerdown={onPointerDown}
				onpointerup={onPointerUp} ondblclick={onDblClick} onwheel={onWheel} oncontextmenu={onContextMenu}
				style="touch-action:none">
				<defs>
					<pattern id="sg" width={ws(gridSnap || 0.5)} height={ws(gridSnap || 0.5)} patternUnits="userSpaceOnUse">
						<path d={`M ${ws(gridSnap || 0.5)} 0 L 0 0 0 ${ws(gridSnap || 0.5)}`}
							fill="none" stroke="var(--editor-grid)" stroke-width="0.5"/>
					</pattern>
					<pattern id="mg" width={zoom} height={zoom} patternUnits="userSpaceOnUse"
						x={patternX} y={patternY}>
						<rect width={zoom} height={zoom} fill="url(#sg)"/>
						<path d={`M ${zoom} 0 L 0 0 0 ${zoom}`}
							fill="none" stroke="var(--editor-grid-strong)" stroke-width="1"/>
					</pattern>
				</defs>

				<!-- Floor -->
				<rect width="100%" height="100%" fill="var(--editor-canvas)"/>
				<rect width="100%" height="100%" fill="url(#mg)"/>

				<!-- ── Ghost outline of floor below ── -->
				{#if activeFloorIdx > 0}
					{@const below = floors[activeFloorIdx - 1]}
					{#each roomOutline(roomParts(below)) as [a, b]}
						<line x1={wx(a.x)} y1={wy(a.y)} x2={wx(b.x)} y2={wy(b.y)}
							stroke="rgba(43,52,98,0.15)" stroke-width="1.5" stroke-dasharray="6,4"
							pointer-events="none"/>
					{/each}
					{#each below.zones as zone}
						<polygon points={zone.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
							fill={zone.color} fill-opacity="0.06" stroke={zone.color} stroke-opacity="0.15"
							stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
					{/each}
					{#each below.walls as wall}
						<polygon points={wall.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
							fill="rgba(43,52,98,0.06)" stroke="rgba(43,52,98,0.15)"
							stroke-width="1" stroke-dasharray="4,3" pointer-events="none"/>
					{/each}
				{/if}

				<!-- ── Room: dim what lies outside, outline the joined shape ── -->
				{#if roomRects.length}
					<defs>
						<mask id="bounds-mask">
							<rect width="100%" height="100%" fill="white"/>
							{#each roomRects as r}
								<rect x={wx(r.x)} y={wy(r.y)} width={ws(r.w)} height={ws(r.h)} fill="black"/>
							{/each}
						</mask>
					</defs>
					<rect width="100%" height="100%" fill="rgba(30,37,71,0.35)" mask="url(#bounds-mask)"/>
					{#each roomEdges as [a, b]}
						<line x1={wx(a.x)} y1={wy(a.y)} x2={wx(b.x)} y2={wy(b.y)}
							stroke="#3b82f6" stroke-width="2" stroke-dasharray="8,4" stroke-linecap="square"
							pointer-events="none"/>
					{/each}
					<!-- While composing or editing the room, show where each part is. -->
					{#if step === 'room' && roomRects.length > 1}
						{#each roomRects as r, ri}
							<rect x={wx(r.x)} y={wy(r.y)} width={ws(r.w)} height={ws(r.h)}
								fill={hoverPart === ri ? 'rgba(239,68,68,0.12)' : 'none'}
								stroke="rgba(59,130,246,0.35)" stroke-width="1" stroke-dasharray="2,3"
								pointer-events="none"/>
						{/each}
					{/if}
					<!-- The selected part: accent outline and four corner handles. -->
					{#if step === 'room' && selectedPart !== null && roomRects[selectedPart] && !boundsLocked}
						{@const r = roomRects[selectedPart]}
						<rect x={wx(r.x)} y={wy(r.y)} width={ws(r.w)} height={ws(r.h)}
							fill="none" stroke="var(--accent)" stroke-width="2.5" pointer-events="none"/>
						{#each [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] as [cx, cy]}
							<circle cx={wx(cx)} cy={wy(cy)} r="7" fill="white" stroke="var(--accent)" stroke-width="2" style="cursor:nwse-resize" pointer-events="auto"/>
						{/each}
					{/if}
				{/if}

				<!-- ── Room rectangle preview ── -->
				{#if boundsStart}
					{@const bx = Math.min(boundsStart.x, cursorPos.x)}
					{@const by = Math.min(boundsStart.y, cursorPos.y)}
					{@const bw = Math.abs(cursorPos.x - boundsStart.x)}
					{@const bh = Math.abs(cursorPos.y - boundsStart.y)}
					<rect x={wx(bx)} y={wy(by)} width={ws(bw)} height={ws(bh)}
						fill="rgba(59,130,246,0.1)" stroke="#3b82f6" stroke-width="2"
						stroke-dasharray="6,3" pointer-events="none"/>
					<text x={wx(bx + bw / 2)} y={wy(by + bh / 2)} text-anchor="middle" dominant-baseline="middle"
						font-size="12" font-weight="600" fill="var(--accent-ink)" pointer-events="none"
						style="paint-order:stroke" stroke="var(--bg-panel)" stroke-width="3">{bw.toFixed(1)} × {bh.toFixed(1)} m</text>
				{/if}

				<!-- ── Zones ── -->
				{#each zones as zone}
					{@const pts = zone.points.map(p => `${wx(p.x)},${wy(p.y)}`).join(' ')}
					{@const sel = zone.id === selectedId}
					<polygon points={pts} fill={zone.color} fill-opacity={sel ? 0.5 : 0.28}
						stroke={zone.color} stroke-width={sel ? 2.5 : 1.5} stroke-opacity="0.7"
						style={tool === 'select' && zoneEditable(zone.id) && !readOnly ? 'cursor:move' : ''}
						pointer-events={tool === 'select' || tool === 'eraser' ? 'auto' : 'none'}/>
					{#if sel && zoneEditable(zone.id) && !readOnly}
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
					<polygon points={pts} fill="var(--editor-wall)" stroke={sel ? 'var(--accent)' : 'none'}
						stroke-width={sel ? 3 : 0}
						style={tool === 'select' && !wallsOff && !readOnly ? 'cursor:move' : ''}
						pointer-events={tool === 'select' || tool === 'eraser' ? 'auto' : 'none'}/>
					{#if sel && !wallsOff && !readOnly}
						{#each wall.points as p, vi}
							<circle cx={wx(p.x)} cy={wy(p.y)} r="6"
								fill={vertexDragIdx === vi && isVertexDragging ? 'var(--accent-hover)' : 'var(--accent)'}
								stroke="white" stroke-width="2" style="cursor:grab"
								pointer-events="auto"/>
						{/each}
					{/if}
				{/each}

				<!-- ── Measurements overlay ── -->
				{#if dimsOn}
					{#if bounds}
						<!-- Overall size: dimension lines above and to the left of the room -->
						{@const top = wy(bounds.y) - 26}
						{@const left = wx(bounds.x) - 26}
						<g class="dim-line" pointer-events="none">
							<line x1={wx(bounds.x)} y1={top} x2={wx(bounds.x + bounds.w)} y2={top}/>
							<line x1={wx(bounds.x)} y1={top - 5} x2={wx(bounds.x)} y2={top + 5}/>
							<line x1={wx(bounds.x + bounds.w)} y1={top - 5} x2={wx(bounds.x + bounds.w)} y2={top + 5}/>
							<line x1={left} y1={wy(bounds.y)} x2={left} y2={wy(bounds.y + bounds.h)}/>
							<line x1={left - 5} y1={wy(bounds.y)} x2={left + 5} y2={wy(bounds.y)}/>
							<line x1={left - 5} y1={wy(bounds.y + bounds.h)} x2={left + 5} y2={wy(bounds.y + bounds.h)}/>
						</g>
						<text x={wx(bounds.x + bounds.w / 2)} y={top - 7} text-anchor="middle" class="dim-label" pointer-events="none">{bounds.w.toFixed(2)} m</text>
						<text x={left - 7} y={wy(bounds.y + bounds.h / 2)} text-anchor="middle" class="dim-label"
							transform={`rotate(-90 ${left - 7} ${wy(bounds.y + bounds.h / 2)})`} pointer-events="none">{bounds.h.toFixed(2)} m</text>
					{/if}
					<!-- Every other measurement, the ones that would cover another left out -->
					{#each dimLabels as l}
						<text x={l.x} y={l.y} text-anchor="middle" dominant-baseline="middle" class={l.cls} pointer-events="none">{l.text}</text>
					{/each}
				{/if}

				<!-- ── Zone labels (drawn ON TOP of walls so they're never hidden; word-wrapped to the zone width) ── -->
				{#each zones as zone}
					{#if zone.label}
						{@const xs = zone.points.map(p => p.x)}
						{@const ys = zone.points.map(p => p.y)}
						{@const cx = xs.reduce((s, v) => s + v, 0) / xs.length}
						{@const cy = ys.reduce((s, v) => s + v, 0) / ys.length}
						{@const widthPx = (Math.max(...xs) - Math.min(...xs)) * zoom}
						{@const lines = wrapLabel(zone.label, Math.max(4, Math.floor((widthPx - 8) / 7)))}
						<text x={wx(cx)} y={wy(cy)} text-anchor="middle" dominant-baseline="middle"
							font-size="12" font-weight="600" fill={zone.color} pointer-events="none"
							style="paint-order:stroke" stroke="rgba(255,255,255,0.85)" stroke-width="3">
							{#each lines as line, i}
								<tspan x={wx(cx)} dy={i === 0 ? -((lines.length - 1) * 13) / 2 : 13}>{line}</tspan>
							{/each}
						</text>
					{/if}
				{/each}

				<!-- ── Tables ── -->
				{#each tables as table}
					{@const chairs = localChairs(table)}
					{@const sel = table.id === selectedId}
					{@const clash = collidingIds.has(table.id)}
					{@const rotH  = table.shape === 'rect' ? table.height/2 : table.radius}
					{@const tag = tagOf(table)}
					{@const sub = (table.label ?? '').trim() !== tag ? (table.label ?? '').trim() : ''}
					{@const fs = Math.max(6, Math.min(ws(0.18), 12))}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g transform={`translate(${wx(table.x)},${wy(table.y)}) rotate(${table.rotation})`}
						class="table-g"
						onpointerdown={(e) => {
							if (e.button !== 0 || spaceDown || e.altKey) return;
							e.stopPropagation();
							if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
							if (readOnly || lockTables) { selectedId = table.id; selectedPart = null; return; }
							if (tool === 'eraser') { pushUndo(); tables = tables.filter(t => t.id !== table.id); return; }
							if (tool === 'select') {
								pushUndo();
								selectedId = table.id; selectedPart = null; isDragging = true;
								dragStart = svgCoords(e); elemStart = { x: table.x, y: table.y };
							}
						}}>

						<!-- Table body (rendered first so chairs appear on top) -->
						{#if table.shape === 'rect'}
							<rect x={-ws(table.width/2)} y={-ws(table.height/2)}
								width={ws(table.width)} height={ws(table.height)} rx={ws(0.06)}
								fill={clash ? '#7f1d1d' : '#92400e'} stroke={clash ? '#ef4444' : sel ? 'var(--accent)' : '#78350f'}
								stroke-width={sel || clash ? 3 : 1.5}/>
						{:else}
							<circle cx={0} cy={0} r={ws(table.radius)}
								fill={clash ? '#7f1d1d' : '#92400e'} stroke={clash ? '#ef4444' : sel ? 'var(--accent)' : '#78350f'}
								stroke-width={sel || clash ? 3 : 1.5}/>
						{/if}

						<!-- Number (T3), and the label under it when it says more -->
						<text x={0} y={sub ? -fs * 0.45 : 0} text-anchor="middle" dominant-baseline="middle"
							font-size={fs * 1.1} font-family="system-ui,sans-serif" font-weight="700"
							fill="rgba(255,250,240,0.98)" pointer-events="none">{tag}</text>
						{#if sub}
							<text x={0} y={fs * 0.75} text-anchor="middle" dominant-baseline="middle"
								font-size={fs * 0.85} font-family="system-ui,sans-serif" font-weight="550"
								fill="rgba(255,250,240,0.85)" pointer-events="none">{sub}</text>
						{/if}

						<!-- Chairs (on top of table body) -->
						{#each chairs as ch, ci}
							{@const gId = table.assignments[ci] ?? null}
							{@const g   = gId ? guests.find(x => x.id === gId) : null}
							{@const drop = !!dragTarget && dragTarget.tableId === table.id && dragTarget.chairIdx === ci}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<g transform={`translate(${ws(ch.x)},${ws(ch.y)}) rotate(${ch.rot})`}
								style="cursor:{tool==='select' && allowGuests && !readOnly ? 'pointer' : 'inherit'}"
								onpointerdown={(e) => {
									if (e.button !== 0 || tool !== 'select' || spaceDown || e.altKey) return;
									e.stopPropagation();
									if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
									selectedId = table.id; selectedPart = null;
									if (!allowGuests || readOnly) return;
									const r = svgEl.getBoundingClientRect();
									chairPopover = { tableId: table.id, chairIdx: ci, x: e.clientX-r.left, y: e.clientY-r.top };
									guestSearch = '';
								}}>
								{#if drop}
									<circle r={ws(0.36)} fill="none" stroke="var(--accent)" stroke-width="3"/>
								{/if}
								<!-- Chair back bar -->
								<rect x={-ws(0.21)} y={-ws(0.21)} width={ws(0.42)} height={ws(0.09)}
									rx={ws(0.04)} fill={g ? '#15803d' : '#78350f'}/>
								<!-- Chair seat -->
								<rect x={-ws(0.21)} y={-ws(0.12)} width={ws(0.42)} height={ws(0.33)}
									rx={ws(0.05)} fill={g ? '#16a34a' : '#a16207'}
									stroke={g ? '#14532d' : '#78350f'} stroke-width="1"/>
								<!-- Initials, or the seat number, when zoomed in enough to read -->
								{#if g && showNames && zoom >= 45}
									<text x={0} y={ws(0.09)} text-anchor="middle" dominant-baseline="middle"
										font-size={Math.max(6, ws(0.18))} font-weight="650"
										fill="white" pointer-events="none">
										{g.firstName[0] ?? ''}{g.lastName[0] ?? ''}
									</text>
								{:else if showSeatNumbers && zoom >= 36}
									<text x={0} y={ws(0.09)} text-anchor="middle" dominant-baseline="middle"
										font-size={Math.max(6, ws(0.17))} font-weight="650"
										fill={g ? 'white' : 'rgba(255,250,240,0.95)'} pointer-events="none">
										{ci + 1}
									</text>
								{/if}
							</g>
						{/each}

						<!-- Rotation handle -->
						{#if sel && !readOnly && !lockTables}
							<line x1={0} y1={-ws(rotH)} x2={0} y2={-ws(rotH+0.65)}
								stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3,2" pointer-events="none"/>
							<circle cx={0} cy={-ws(rotH+0.65)} r={6}
								fill="var(--accent)" stroke="white" stroke-width="2"
								style="cursor:grab"
								onpointerdown={(e) => startRotate(e, table)}/>
						{/if}
					</g>
				{/each}

				<!-- ── Standalone chairs ── -->
				{#each seats as seat, si}
					{@const sg = seat.assignment ? guests.find(x => x.id === seat.assignment) : null}
					{@const ssel = selectedId === seat.id}
					{@const drop = !!dragTarget && dragTarget.seatId === seat.id}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<g transform={`translate(${wx(seat.x)},${wy(seat.y)}) rotate(${seat.rotation})`}
						style="cursor:{tool==='select' && !readOnly ? 'pointer' : 'inherit'}"
						onpointerdown={(e) => {
							if (e.button !== 0 || spaceDown || e.altKey) return;
							e.stopPropagation();
							if (chairPopover) { chairPopover = null; guestSearch = ''; return; }
							if (readOnly) { selectedId = seat.id; return; }
							if (tool === 'eraser' && !lockTables) { pushUndo(); seats = seats.filter(s => s.id !== seat.id); return; }
							if (tool === 'select') {
								selectedId = seat.id; selectedPart = null;
								// With the tables fixed a press only opens the seat, never moves it.
								isDragging = !lockTables;
								dragStart = svgCoords(e);
								elemStart = { x: seat.x, y: seat.y };
								const r = svgEl.getBoundingClientRect();
								seatClickCandidate = { id: seat.id, x: e.clientX - r.left, y: e.clientY - r.top };
							}
						}}>
						{#if ssel || drop}
							<circle cx={0} cy={0} r={ws(0.32)} fill="none" stroke="var(--accent)" stroke-width="2.5"/>
						{/if}
						<!-- Chair back bar -->
						<rect x={-ws(0.21)} y={-ws(0.24)} width={ws(0.42)} height={ws(0.09)}
							rx={ws(0.04)} fill={sg ? '#15803d' : '#475569'}/>
						<!-- Chair seat -->
						<rect x={-ws(0.21)} y={-ws(0.15)} width={ws(0.42)} height={ws(0.36)}
							rx={ws(0.05)} fill={sg ? '#16a34a' : '#94a3b8'}
							stroke={sg ? '#14532d' : '#475569'} stroke-width="1"/>
						{#if sg && showNames && zoom >= 45}
							<text x={0} y={ws(0.05)} text-anchor="middle" dominant-baseline="middle"
								font-size={Math.max(6, ws(0.18))} font-weight="650"
								fill="white" pointer-events="none">
								{sg.firstName[0] ?? ''}{sg.lastName[0] ?? ''}
							</text>
						{:else if showSeatNumbers && zoom >= 36}
							<text x={0} y={ws(0.05)} text-anchor="middle" dominant-baseline="middle"
								font-size={Math.max(6, ws(0.17))} font-weight="650"
								fill="white" pointer-events="none">
								{si + 1}
							</text>
						{/if}
					</g>
				{/each}

				<!-- ── Rectangle being dragged out ── -->
				{#if rectStart && rectMoved}
					{@const rx = Math.min(rectStart.x, cursorPos.x)}
					{@const ry = Math.min(rectStart.y, cursorPos.y)}
					{@const rw = Math.abs(cursorPos.x - rectStart.x)}
					{@const rh = Math.abs(cursorPos.y - rectStart.y)}
					<rect x={wx(rx)} y={wy(ry)} width={ws(rw)} height={ws(rh)}
						fill={tool === 'wall' ? 'rgba(43,52,98,0.35)' : `${zoneColor}55`}
						stroke={tool === 'wall' ? '#2b3462' : zoneColor} stroke-width="2" stroke-dasharray="6,3" pointer-events="none"/>
					<text x={wx(rx + rw / 2)} y={wy(ry + rh / 2)} text-anchor="middle" dominant-baseline="middle"
						font-size="12" font-weight="600" fill="var(--accent-ink)" pointer-events="none"
						style="paint-order:stroke" stroke="var(--bg-panel)" stroke-width="3">{rw.toFixed(1)} × {rh.toFixed(1)} m</text>
				{/if}

				<!-- ── Draggable corners of every wall / zone while its tool is active ── -->
				{#if rectDraw && !readOnly && !isDrawing && (tool === 'wall' || tool === 'zone')}
					{#each toolShapes() as sh (sh.id)}
						{#if sh.id !== selectedId}
							{#each sh.points as p}
								<circle cx={wx(p.x)} cy={wy(p.y)} r="4" fill="var(--bg-panel)" stroke="var(--accent)" stroke-width="1.5" opacity="0.8" pointer-events="none"/>
							{/each}
						{/if}
					{/each}
				{/if}

				<!-- ── Where a click adds a corner: the middle of each edge of the selected shape ── -->
				{#if rectDraw && !readOnly && !isDrawing && (tool === 'select' || tool === 'wall' || tool === 'zone')}
					{@const pts = (selectedWall && !wallsOff ? selectedWall.points : selectedZone && zoneEditable(selectedZone.id) ? selectedZone.points : null)}
					{#if pts}
						{#each pts as p, i}
							{@const q = pts[(i + 1) % pts.length]}
							<circle cx={wx((p.x + q.x) / 2)} cy={wy((p.y + q.y) / 2)} r="4"
								fill="var(--bg-panel)" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="2,1.5" pointer-events="none"/>
						{/each}
					{/if}
				{/if}

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
					<!-- The length of the side being drawn, as it is drawn -->
					{@const last = drawPts[drawPts.length - 1]}
					{@const segLen = Math.hypot(cursorPos.x - last.x, cursorPos.y - last.y)}
					{#if segLen >= 0.05}
						<text x={(wx(last.x) + wx(cursorPos.x)) / 2} y={(wy(last.y) + wy(cursorPos.y)) / 2 - 10} text-anchor="middle"
							dominant-baseline="middle" class="dim-label" pointer-events="none">{segLen.toFixed(2)} m</text>
					{/if}
					{#each drawPts as p, i}
						{@const near = i===0 && nearFirstPoint(cursorPos)}
						<circle cx={wx(p.x)} cy={wy(p.y)} r={i===0?(near?9:6):4}
							fill={near?'#16a34a':(tool==='wall'?'#2b3462':zoneColor)}
							stroke="white" stroke-width="1.5" pointer-events="none"/>
					{/each}
				{/if}

				<!-- ── Pillar ghost ── -->
				{#if tool === 'pillar' && !readOnly}
					{#if pillarRound}
						<circle cx={wx(cursorPos.x)} cy={wy(cursorPos.y)} r={ws(pillarSize / 2)}
							fill="rgba(43,52,98,0.35)" stroke="#2b3462" stroke-width="1.5" stroke-dasharray="4,3" pointer-events="none"/>
					{:else}
						<rect x={wx(cursorPos.x - pillarSize / 2)} y={wy(cursorPos.y - pillarSize / 2)} width={ws(pillarSize)} height={ws(pillarSize)}
							fill="rgba(43,52,98,0.35)" stroke="#2b3462" stroke-width="1.5" stroke-dasharray="4,3" pointer-events="none"/>
					{/if}
				{/if}

				<!-- ── Table ghost ── -->
				{#if tool === 'table' && !readOnly && (!tablesFromTypesOnly || selectedType)}
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

				<!-- ── Chair ghost ── -->
				{#if tool === 'chair' && !readOnly}
					<rect x={wx(cursorPos.x - 0.21)} y={wy(cursorPos.y - 0.21)} width={ws(0.42)} height={ws(0.42)} rx={ws(0.05)}
						fill="#94a3b8" opacity="0.6" stroke="#475569" stroke-dasharray="3,2" pointer-events="none"/>
				{/if}

				<!-- ── Cursor guidelines (full canvas hairlines) ── -->
				{#if !readOnly && tool !== 'select' && tool !== 'eraser'}
					<line x1={0} y1={wy(cursorPos.y)} x2="100%" y2={wy(cursorPos.y)}
						stroke="color-mix(in srgb, var(--accent) 25%, transparent)" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
					<line x1={wx(cursorPos.x)} y1={0} x2={wx(cursorPos.x)} y2="100%"
						stroke="color-mix(in srgb, var(--accent) 25%, transparent)" stroke-width="1" stroke-dasharray="4,4" pointer-events="none"/>
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

				<!-- ── Live dimensions while a room part is moved or resized ── -->
				{#if partDrag && roomRects[partDrag.idx]}
					{@const r = roomRects[partDrag.idx]}
					<text x={wx(r.x + r.w / 2)} y={wy(r.y + r.h / 2)} text-anchor="middle" dominant-baseline="middle"
						class="dim-label" pointer-events="none">{r.w.toFixed(1)} × {r.h.toFixed(1)} m</text>
					<text x={wx(r.x + r.w / 2)} y={wy(r.y) - 8} text-anchor="middle" class="dim-label dim-edge" pointer-events="none">{r.w.toFixed(1)} m</text>
					<text x={wx(r.x) + 8} y={wy(r.y + r.h / 2)} text-anchor="start" dominant-baseline="middle" class="dim-label dim-edge" pointer-events="none">{r.h.toFixed(1)} m</text>
				{/if}

				<!-- ── Live dimensions while a corner of a wall or zone is dragged ── -->
				{#if isVertexDragging && vertexDragIdx >= 0}
					{@const pts = (walls.find(w => w.id === selectedId) ?? zones.find(z => z.id === selectedId))?.points}
					{#if pts && pts[vertexDragIdx]}
						{@const n = pts.length}
						{@const v = pts[vertexDragIdx]}
						{@const xs = pts.map(q => q.x)}
						{@const ys = pts.map(q => q.y)}
						{@const bw = Math.max(...xs) - Math.min(...xs)}
						{@const bh = Math.max(...ys) - Math.min(...ys)}
						<text x={wx((Math.max(...xs) + Math.min(...xs)) / 2)} y={wy((Math.max(...ys) + Math.min(...ys)) / 2)} text-anchor="middle" dominant-baseline="middle"
							class="dim-label" pointer-events="none">{bw.toFixed(1)} × {bh.toFixed(1)} m</text>
						{#each [pts[(vertexDragIdx - 1 + n) % n], pts[(vertexDragIdx + 1) % n]] as q}
							<text x={wx((v.x + q.x) / 2)} y={wy((v.y + q.y) / 2) - 8} text-anchor="middle" class="dim-label dim-edge" pointer-events="none">{Math.hypot(v.x - q.x, v.y - q.y).toFixed(2)} m</text>
						{/each}
					{/if}
				{/if}

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
						fill="var(--bg-panel)" stroke="var(--accent)" stroke-width="1" pointer-events="none"/>
					<text x={mx} y={my + 4} text-anchor="middle" font-size="11" font-weight="600"
						fill="var(--accent-ink)" font-family="monospace" pointer-events="none">{dist.toFixed(2)}m</text>
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
						fill="var(--bg-panel)" stroke="var(--accent)" stroke-width="1" pointer-events="none"/>
					<text x={mx} y={my + 4} text-anchor="middle" font-size="11" font-weight="600"
						fill="var(--accent-ink)" font-family="monospace" pointer-events="none">{dist.toFixed(2)}m</text>
				{/if}
			</svg>

			<!-- ── Edge rulers (optional) ── -->
			{#if showRulers}
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
			{/if}

			<!-- ── Instruction bar: what to do now, with the actions that finish it ── -->
			<div class="instr" role="status" aria-live="polite">
				<span class="instr-dot" class:busy={isDrawing || !!boundsStart || !!measureStart}></span>
				<span class="instr-text">{instruction}</span>
				{#if isDrawing}
					<button type="button" class="instr-btn ok" onclick={finishDrawing} disabled={drawPts.length < 3}>{tr.editor.closeShape}</button>
					<button type="button" class="instr-btn" onclick={cancelDrawing}>{tr.common.cancel}</button>
				{:else if boundsStart}
					<button type="button" class="instr-btn" onclick={() => boundsStart = null}>{tr.common.cancel}</button>
				{:else if measureStart || measureEnd}
					<button type="button" class="instr-btn" onclick={() => { measureStart = null; measureEnd = null; }}>{tr.editor.clear}</button>
				{/if}
			</div>

			<!-- ── First-run tip for this step ── -->
			{#if coachVisible}
				<div class="coach-pos">
					<CoachMark title={stepLabel(step)} text={coachText(step)} dismissLabel={tr.editor.gotIt} onDismiss={dismissCoach} />
				</div>
			{/if}

			<!-- ── Legend while seating ── -->
			{#if step === 'guests' && allowGuests}
				<div class="legend" aria-hidden="true">
					<span><i style="background:#16a34a"></i>{tr.editor.legendSeated}</span>
					<span><i style="background:#a16207"></i>{tr.editor.legendFree}</span>
					<span><i class="ring"></i>{tr.editor.legendSelected}</span>
				</div>
			{/if}

			<!-- ── Status strip: grid, snapping, toggles, cursor ── -->
			<div class="status-strip">
				<div class="custom-select" role="listbox" tabindex="0" aria-label={tr.editor.snap}
					onclick={(e) => { e.stopPropagation(); snapDropOpen = !snapDropOpen; }}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); snapDropOpen = !snapDropOpen; } }}>
					<span class="custom-select-value">{gridSnap === 0 ? tr.editor.gridOff : tr.editor.gridLabel(gridSnap)}</span>
					<svg class="custom-select-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
					{#if snapDropOpen}
						<div class="custom-select-dropdown">
							{#each [0, 0.25, 0.5, 1, 2] as val}
								<button type="button" class="custom-select-option" class:selected={gridSnap === val}
									onclick={(e) => { e.stopPropagation(); gridSnap = val; snapDropOpen = false; }}>
									{val === 0 ? tr.editor.gridOff : tr.editor.gridLabel(val)}
								</button>
							{/each}
						</div>
					{/if}
				</div>
				<button type="button" class="toggle" class:on={snapToElements} onclick={() => snapToElements = !snapToElements} aria-pressed={snapToElements}>
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
					{tr.editor.snapObjects}
				</button>
				<button type="button" class="toggle" class:on={showRulers} onclick={() => showRulers = !showRulers} aria-pressed={showRulers}>{tr.editor.rulers}</button>
				<button type="button" class="toggle" class:on={dimsOn} disabled={step === 'check'} onclick={() => showDims = !showDims} aria-pressed={dimsOn} title="{tr.editor.measurements} (D)">{tr.editor.measurements}</button>
				{#if allowGuests || tables.length}
					<button type="button" class="toggle" class:on={showSeatNumbers} onclick={() => showSeatNumbers = !showSeatNumbers} aria-pressed={showSeatNumbers}>{tr.editor.seatNumbers}</button>
				{/if}
				{#if allowGuests}
					<button type="button" class="toggle" class:on={showNames} onclick={() => showNames = !showNames} aria-pressed={showNames}>{tr.editor.namesOnChairs}</button>
				{/if}
				<span class="coords">{cursorPos.x.toFixed(2)} m · {cursorPos.y.toFixed(2)} m</span>
				{#if collidingIds.size > 0}
					<span class="status-warn">{tr.editor.tablesClash(collidingIds.size)}</span>
				{/if}
			</div>

			<!-- ── Zoom ── -->
			<div class="zoom" role="group" aria-label={tr.editor.zoom}>
				<button type="button" onclick={() => zoomBy(1 / 1.2)} aria-label={tr.editor.zoomOut}>−</button>
				<button type="button" class="pct" onclick={() => { zoom = 60; }} title="100%">{zoomPercent}%</button>
				<button type="button" onclick={() => zoomBy(1.2)} aria-label={tr.editor.zoomIn}>+</button>
				<button type="button" class="fit" onclick={fitToRoom} title="{tr.editor.fitRoom} (Shift+1)">{tr.editor.fitRoom}</button>
			</div>

			<!-- Chair assignment popover -->
			{#if chairPopover && allowGuests}
				<div class="overlay" role="presentation"
					onclick={() => { chairPopover = null; guestSearch = ''; }}
					onkeydown={(e) => e.key==='Escape' && (chairPopover = null)}></div>
				<div class="chair-popover"
					style="left:{Math.min(chairPopover.x+12, 9999)}px; top:{Math.min(chairPopover.y-8, 9999)}px">
					<div class="pop-header">
						<span>
							{#if popoverTable && chairPopover.chairIdx != null}
								{tr.editor.seatRef(tableName(popoverTable), chairPopover.chairIdx + 1)}
							{:else if popoverSeat}
								{tr.editor.chairRef(seats.indexOf(popoverSeat) + 1)}
							{/if}
						</span>
						<button type="button" class="pop-close" onclick={() => { chairPopover = null; guestSearch = ''; }} aria-label={tr.common.cancel}>✕</button>
					</div>
					{#if popoverChairGuest}
						<div class="pop-assigned">
							<span class="pop-name">{popoverChairGuest.firstName} {popoverChairGuest.lastName}</span>
							{#if popoverChairGuest.group}<span class="pop-group">{popoverChairGuest.group}</span>{/if}
							<button type="button" class="pop-clear" onclick={clearChairAssignment}>{tr.editor.remove}</button>
						</div>
						{#if popoverChairGuest.note}
							<div class="pop-note">
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
								<span>{popoverChairGuest.note}</span>
							</div>
						{/if}
					{:else}
						<div class="pop-empty">{tr.editor.unassigned}</div>
					{/if}
					<!-- svelte-ignore a11y_autofocus -->
					<input class="pop-search" type="text" placeholder={tr.editor.searchGuests} bind:value={guestSearch} autofocus
						onkeydown={(e) => { if (e.key === 'Enter' && filteredPopoverGuests[0]) { const g = filteredPopoverGuests[0]; popoverCurrentId === g.id ? clearChairAssignment() : assignGuest(g.id); } }} />
					<div class="pop-list">
						{#each filteredPopoverGuests as g}
							{@const isCurrent = popoverCurrentId === g.id}
							<button type="button" class="pop-guest" class:current={isCurrent}
								onclick={() => isCurrent ? clearChairAssignment() : assignGuest(g.id)}>
								<span class="pop-gname">{g.lastName}, {g.firstName}</span>
								{#if g.group}<span class="pop-ggroup">{g.group}</span>{/if}
								{#if isCurrent}<span class="pop-check">✓</span>{/if}
							</button>
						{:else}
							<div class="pop-empty" style="padding:8px 12px">{tr.editor.noUnassignedGuests}</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Right-click menu -->
			{#if ctxMenu}
				<div class="overlay" role="presentation" onpointerdown={() => ctxMenu = null} oncontextmenu={(e) => { e.preventDefault(); ctxMenu = null; }}></div>
				<div class="ctx-menu" role="menu" aria-label={ctxMenu.title} style="left:{ctxMenu.x}px; top:{ctxMenu.y}px">
					<div class="ctx-title">{ctxMenu.title}</div>
					{#each ctxMenu.items as item}
						<button type="button" role="menuitem" class="ctx-item" class:danger={item.danger} disabled={item.disabled} onclick={() => runCtx(item)}>
							<span>{item.label}</span>
							{#if item.kbd}<kbd>{item.kbd}</kbd>{/if}
						</button>
					{/each}
				</div>
			{/if}

			<!-- Help: every shortcut, in one place -->
			{#if helpOpen}
				<div class="help-pop" role="dialog" aria-label={tr.editor.help}>
					<div class="help-head"><b>{tr.editor.shortcuts}</b><button type="button" class="pop-close" onclick={() => helpOpen = false} aria-label={tr.common.cancel}>✕</button></div>
					<dl>
						{#each toolCards as c}
							<div><dt><kbd>{c.kbd}</kbd></dt><dd>{c.name}</dd></div>
						{/each}
						<div><dt><kbd>Enter</kbd></dt><dd>{tr.editor.kbdClose}</dd></div>
						<div><dt><kbd>Esc</kbd></dt><dd>{tr.editor.kbdCancel}</dd></div>
						<div><dt><kbd>Delete</kbd></dt><dd>{tr.editor.kbdDelete}</dd></div>
						<div><dt><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>{tr.editor.undo} / {tr.editor.redo}</dd></div>
						<div><dt><kbd>Shift</kbd>+<kbd>1</kbd></dt><dd>{tr.editor.kbdFit}</dd></div>
					</dl>
					<p>{tr.editor.kbdPan}</p>
				</div>
			{/if}
		</main>

		<!-- Right panel: progress, then what the step needs -->
		<aside class="panel">
			<div class="panel-scroll">
				<section>
					<div class="sec-title">{tr.editor.progress}</div>
					<ol class="progress">
						{#each stepItems as s (s.id)}
							<li class={s.state}>
								<button type="button" onclick={() => goStep(s.id)}>
									<i>{s.state === 'done' ? '✓' : s.index}</i>
									<span><b>{s.label}</b><em>{stepFact(s.id as StepId)}</em></span>
								</button>
							</li>
						{/each}
					</ol>
				</section>

				<!-- ── Room step ── -->
				{#if step === 'room'}
					<section>
						<div class="sec-title">{tr.editor.roomParts}</div>
						{#if roomRects.length}
							<ul class="room-parts">
								{#each roomRects as r, ri}
									<li class:on={selectedPart === ri} onmouseenter={() => hoverPart = ri} onmouseleave={() => hoverPart = null}>
										<button type="button" class="part-pick" onclick={() => { selectedPart = ri; selectedId = null; tool = 'select'; }}>
											{tr.editor.roomPart(ri + 1)} · {r.w.toFixed(1)} × {r.h.toFixed(1)} m
										</button>
										{#if !boundsLocked}
											<button type="button" class="part-del" title={tr.editor.removePart} aria-label={tr.editor.removePart}
												onclick={() => removeRoomPart(ri)}>×</button>
										{/if}
									</li>
								{/each}
							</ul>
							<div class="stat"><span>{tr.editor.roomArea}</span><b>{roomArea(roomRects).toFixed(1)} m²</b></div>
							{#if !partsConnected(roomRects)}<p class="warn-text">{tr.editor.roomDisconnected}</p>{/if}
							{#if tool === 'bounds'}<p class="help-text">{tr.editor.boundsAddHint}</p>{/if}
							{#if !boundsLocked}
								<button type="button" class="btn-del" onclick={() => { pushUndo(); roomRects = []; selectedPart = null; }}>{tr.editor.removeRoom}</button>
							{/if}
						{:else}
							<p class="help-text">{tr.editor.boundsHelp}</p>
						{/if}
					</section>
				{/if}

				<!-- ── Walls step ── -->
				{#if step === 'walls'}
					{#if isDrawing && tool === 'wall'}
						<section>
							<div class="sec-title">{tr.editor.wallDrawing}</div>
							<div class="stat"><span>{tr.editor.corners}</span><b>{drawPts.length}</b></div>
							{#if drawPts.length >= 2}
								{@const a = drawPts[drawPts.length - 2]}
								{@const b = drawPts[drawPts.length - 1]}
								<div class="stat"><span>{tr.editor.lastEdge}</span><b>{Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} m</b></div>
							{/if}
						</section>
					{:else if selectedWall}
						{@const wr = axisRect(selectedWall.points)}
						<section>
							<div class="sec-title">{tr.editor.wall}</div>
							<div class="stat"><span>{tr.editor.vertices}</span><b>{selectedWall.points.length}</b></div>
							{#if wr && !wallsOff}
								<!-- A straight run of wall or a square pillar: its size typed in. -->
								<div class="field-row">
									<div class="field">
										<label for="w-w">{tr.editor.widthM}</label>
										<input id="w-w" type="number" min="0.05" step="0.05" value={wr.w}
											onfocus={pushUndo} oninput={(e) => setWallSize(selectedWall.id, { w: +((e.target as HTMLInputElement).value) })}/>
									</div>
									<div class="field">
										<label for="w-h">{tr.editor.depthM}</label>
										<input id="w-h" type="number" min="0.05" step="0.05" value={wr.h}
											onfocus={pushUndo} oninput={(e) => setWallSize(selectedWall.id, { h: +((e.target as HTMLInputElement).value) })}/>
									</div>
								</div>
								<p class="help-text">{tr.editor.wallThicknessHelp}</p>
							{/if}
							<p class="help-text">{tr.editor.wallHelp}</p>
							{#if !wallsOff}
								<button type="button" class="btn-del" onclick={() => { pushUndo(); walls=walls.filter(w=>w.id!==selectedId); selectedId=null; }}>{tr.editor.deleteWall}</button>
							{/if}
						</section>
					{:else}
						<section>
							<div class="sec-title">{tr.editor.stepWalls}</div>
							<p class="help-text">{tr.editor.wallsOptional}</p>
						</section>
					{/if}
				{/if}

				<!-- ── Zone options: the zones step, or a zone in the chairs step ── -->
				{#if (step === 'zones' || step === 'chairs') && (tool === 'zone' || (selectedZone && zoneEditable(selectedZone.id)))}
					{@const Z = selectedZone && zoneEditable(selectedZone.id) ? selectedZone : null}
					<section>
						<div class="sec-title">{Z ? Z.label || tr.editor.zoneOptions : tr.editor.zoneNew}</div>
						{#if Z}
							<div class="field">
								<label for="z-lbl">{tr.common.name}</label>
								<input id="z-lbl" type="text" value={Z.label}
									oninput={(e) => updateZone({ label: (e.target as HTMLInputElement).value })}/>
							</div>
						{/if}
						<div class="field">
							<label for="z-col">{tr.editor.colour}</label>
							<div class="swatches">
								{#each ZONE_PRESETS as c}
									<button type="button" class="swatch" class:on={(Z?.color ?? zoneColor)===c}
										style="background:{c}" aria-label="{tr.editor.setColour} {c}"
										onclick={() => { if(Z) updateZone({color:c}); else zoneColor=c; }}></button>
								{/each}
								<input id="z-col" type="color" value={Z?.color ?? zoneColor}
									oninput={(e) => { const v=(e.target as HTMLInputElement).value; if(Z) updateZone({color:v}); else zoneColor=v; }}
									title={tr.editor.custom}/>
							</div>
						</div>
						{#if Z}
							<button type="button" class="btn-del" onclick={() => { pushUndo(); zones=zones.filter(z=>z.id!==selectedId); selectedId=null; }}>{tr.editor.deleteZone}</button>
						{/if}
					</section>
				{:else if step === 'zones' && !selectedZone}
					<section>
						<div class="sec-title">{tr.editor.stepZones}</div>
						<p class="help-text">{tr.editor.toolZoneHow}</p>
						{#if zones.length}
							<ul class="obj-list">
								{#each zones as z}
									<li><button type="button" class:on={selectedId === z.id} onclick={() => { selectedId = z.id; tool = 'select'; }}><i style="background:{z.color}"></i>{z.label || tr.editor.zoneOptions}</button></li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}

				<!-- ── Tables: inventory while placing, properties when one is selected ── -->
				{#if step === 'tables' && tableTypes && tableTypes.length > 0 && tool === 'table' && !selectedTable}
					<section>
						<div class="sec-title">{tr.editor.inventory}</div>
						<div class="inventory-list">
							{#each tableTypes as tt}
								{@const left = typeLeft(tt)}
								<button type="button" class="inventory-item" class:active={selectedTypeId === tt.id} class:spent={left <= 0}
									onclick={() => { selectedTypeId = tt.id; }}>
									<div class="inv-preview">
										{#if tt.shape === 'round'}
											<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="#92400e" opacity="0.8"/></svg>
										{:else}
											<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="10" width="32" height="20" rx="3" fill="#92400e" opacity="0.8"/></svg>
										{/if}
									</div>
									<div class="inv-info">
										<span class="inv-name">{tt.name}</span>
										<span class="inv-detail">{tr.editor.tableTypeFacts(tt.shape === 'round' ? `⌀ ${(Number(tt.radius) * 2).toFixed(1)} m` : `${tt.width} × ${tt.height} m`, Number(tt.max_chairs))}</span>
										{#if Number.isFinite(left)}
											<span class="inv-stock" class:none={left <= 0}>{tr.editor.inventoryLeft(Math.max(0, left), typeLimit(tt))}</span>
										{/if}
									</div>
								</button>
							{/each}
						</div>
					</section>
				{/if}

				{#if (step === 'tables' || step === 'chairs') && ((tool === 'table' && !(tableTypes && tableTypes.length > 0)) || selectedTable)}
					{@const T = selectedTable}
					{@const isInventoryTable = T?.typeId && tableTypes?.find(tt => tt.id === T.typeId)}
					{@const maxChairs = isInventoryTable ? Number((tableTypes?.find(tt => tt.id === T?.typeId))?.max_chairs ?? 999) : 999}
					<section>
						<div class="sec-title">{T ? tableName(T) : tr.editor.freeformTable}</div>

						{#if T}
							<div class="field">
								<label for="t-lbl">{tr.common.name}</label>
								<input id="t-lbl" type="text" value={T.label}
									oninput={(e) => updateTable({ label: (e.target as HTMLInputElement).value })}/>
							</div>
						{/if}

						{#if !isInventoryTable}
							<div class="field">
								<label for="t-shp">{tr.editor.shape}</label>
								<select id="t-shp" value={T?.shape ?? tShape}
									onchange={(e) => {
										const v = (e.target as HTMLSelectElement).value as TableShape;
										if (T) updateTable({ shape: v }); else tShape = v;
									}}>
									<option value="rect">{tr.editor.rectangular}</option>
									<option value="round">{tr.editor.round}</option>
								</select>
							</div>

							{#if (T?.shape ?? tShape) === 'rect'}
								<div class="field-row">
									<div class="field">
										<label for="t-w">{tr.editor.widthM}</label>
										<input id="t-w" type="number" min="0.5" max="12" step="0.5"
											value={T?.width ?? tWidth}
											oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({width:v}); else tWidth=v; }}/>
									</div>
									<div class="field">
										<label for="t-h">{tr.editor.depthM}</label>
										<input id="t-h" type="number" min="0.5" max="12" step="0.5"
											value={T?.height ?? tHeight}
											oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({height:v}); else tHeight=v; }}/>
									</div>
								</div>
							{:else}
								<div class="field">
									<label for="t-r">{tr.editor.radiusM}</label>
									<input id="t-r" type="number" min="0.5" max="6" step="0.25"
										value={T?.radius ?? Math.max(tWidth,tHeight)/2}
										oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({radius:v,width:v*2,height:v*2}); else { tWidth=v*2; tHeight=v*2; } }}/>
								</div>
							{/if}
						{:else if isInventoryTable && T}
							<div class="inv-locked-info">
								{T.shape === 'round' ? `⌀ ${(Number(T.radius) * 2).toFixed(1)} m` : `${T.width} × ${T.height} m`}
								· {tr.editor.inventoryType}
							</div>
						{/if}

						{#if (T?.shape ?? tShape) === 'round'}
							<div class="field">
								<label for="t-ch">{tr.editor.chairs} {maxChairs < 999 ? `(${tr.editor.max} ${maxChairs})` : ''}</label>
								<input id="t-ch" type="number" min="0" max={maxChairs} step="1"
									value={T?.chairs ?? tChairs}
									oninput={(e) => { const el = e.target as HTMLInputElement; const v = Math.max(0, Math.min(Math.floor(+el.value || 0), maxChairs)); if(T) updateTable({chairs:v}); else tChairs=v; showClamped(el, v); }}/>
							</div>
						{:else}
							{@const currentTotal = T ? (Number(T.chairsTop)||0)+(Number(T.chairsBottom)||0)+(Number(T.chairsLeft)||0)+(Number(T.chairsRight)||0) : tChairsTop+tChairsBottom+tChairsLeft+tChairsRight}
							{#if maxChairs < 999}
								<div class="chair-limit-hint">{currentTotal} / {maxChairs} {tr.editor.chairsWord}</div>
							{/if}
							<div class="field-row">
								<div class="field">
									<label for="t-ct">{tr.editor.top}</label>
									<input id="t-ct" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsTop ?? tChairsTop}
										oninput={(e) => setSideChairs(e, 'chairsTop', T, v => tChairsTop = v)}/>
								</div>
								<div class="field">
									<label for="t-cb">{tr.editor.bottom}</label>
									<input id="t-cb" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsBottom ?? tChairsBottom}
										oninput={(e) => setSideChairs(e, 'chairsBottom', T, v => tChairsBottom = v)}/>
								</div>
							</div>
							<div class="field-row">
								<div class="field">
									<label for="t-cl">{tr.editor.left}</label>
									<input id="t-cl" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsLeft ?? tChairsLeft}
										oninput={(e) => setSideChairs(e, 'chairsLeft', T, v => tChairsLeft = v)}/>
								</div>
								<div class="field">
									<label for="t-cr">{tr.editor.right}</label>
									<input id="t-cr" type="number" min="0" max={maxChairs} step="1"
										value={T?.chairsRight ?? tChairsRight}
										oninput={(e) => setSideChairs(e, 'chairsRight', T, v => tChairsRight = v)}/>
								</div>
							</div>
						{/if}

						{#if (T?.shape ?? tShape) === 'rect'}
						<div class="field">
							<label for="t-sp">{tr.editor.chairSpacing}</label>
							<div style="display:flex;align-items:center;gap:8px">
								<input id="t-sp" type="range" min="0" max="0.8" step="0.05"
									value={T?.chairSpacing ?? tChairSpacing}
									oninput={(e) => { const v=+((e.target as HTMLInputElement).value); if(T) updateTable({chairSpacing:v}); else tChairSpacing=v; }}
									style="flex:1"/>
								<span class="val">{((T?.chairSpacing ?? tChairSpacing)*100).toFixed(0)} cm</span>
							</div>
						</div>
						{/if}

						{#if T}
							<div class="field">
								<label for="t-rot">{tr.editor.rotation}</label>
								<input id="t-rot" type="number" min="-180" max="180" step="5"
									value={T.rotation}
									oninput={(e) => updateTable({ rotation: +((e.target as HTMLInputElement).value) })}/>
							</div>
							<div class="field">
								<label for="t-note">{tr.editor.tableNote}</label>
								<input id="t-note" type="text" value={T.note ?? ''} placeholder={tr.editor.tableNotePlaceholder}
									oninput={(e) => updateTable({ note: (e.target as HTMLInputElement).value || undefined })}/>
							</div>
							{#if allowGuests}
								{@const assigned = T.assignments.filter(Boolean).length}
								<div class="seat-summary">
									<span>{assigned}/{totalChairs(T)} {tr.editor.seatsAssigned}</span>
									<div class="seat-dots">
										{#each T.assignments as a}
											<span class="dot" class:filled={!!a}></span>
										{/each}
									</div>
								</div>
							{/if}
							<button type="button" class="btn-del" onclick={() => { pushUndo(); tables=tables.filter(t=>t.id!==selectedId); selectedId=null; }}>
								{tr.editor.deleteTable}
							</button>
						{/if}
					</section>
				{/if}

				<!-- ── A standalone chair ── -->
				{#if (step === 'chairs' || step === 'tables') && selectedSeat}
					<section>
						<div class="sec-title">{tr.editor.chairRef(seats.indexOf(selectedSeat) + 1)}</div>
						<div class="field">
							<label for="s-rot">{tr.editor.rotation}</label>
							<input id="s-rot" type="number" min="-180" max="180" step="5" value={selectedSeat.rotation}
								oninput={(e) => updateSeat({ rotation: +((e.target as HTMLInputElement).value) })}/>
						</div>
						<button type="button" class="btn-del" onclick={() => { pushUndo(); seats = seats.filter(s => s.id !== selectedId); selectedId = null; }}>{tr.editor.remove}</button>
					</section>
				{/if}

				<!-- ── Guests step: the selected table's seats ── -->
				{#if step === 'guests' && allowGuests}
					{#if selectedTable}
						{@const T = selectedTable}
						{@const free = T.assignments.filter(a => !a).length}
						<section>
							<div class="sec-title-row">
								<span class="sec-title" style="margin-bottom:0">{tableName(T)}</span>
								<span class="muted">{T.assignments.length - free}/{T.assignments.length} · {free} {tr.editor.seatEmpty.toLowerCase()}</span>
							</div>
							<ol class="seats">
								{#each T.assignments as a, i}
									{@const g = a ? guests.find(x => x.id === a) : null}
									<li class:empty={!g} class:drop={!!dragTarget && dragTarget.tableId === T.id && dragTarget.chairIdx === i}>
										<i>{i + 1}</i>
										{#if g}
											<span class="nm">{g.firstName} {g.lastName}{#if g.group}<em> · {g.group}</em>{/if}</span>
											<button type="button" class="x" onclick={() => clearSeat({ tableId: T.id, chairIdx: i })} aria-label="{tr.editor.remove}: {g.firstName} {g.lastName}">×</button>
										{:else}
											<span class="nm muted">{tr.editor.seatEmpty}</span>
											<button type="button" class="assign" onclick={() => openSeatPopover(T, i)}>{tr.editor.assign}</button>
										{/if}
									</li>
								{/each}
							</ol>
							{#if groupSuggestion}
								<div class="suggest">
									<p>{tr.editor.suggestGroup(groupSuggestion.group, groupSuggestion.total)}</p>
									<div class="row"><button type="button" class="btn-sm" onclick={seatSuggestion}>{tr.editor.seatThemHere}</button></div>
								</div>
							{/if}
							<div class="field" style="margin-top:8px">
								<label for="g-note">{tr.editor.tableNote}</label>
								<input id="g-note" type="text" value={T.note ?? ''} placeholder={tr.editor.tableNotePlaceholder}
									oninput={(e) => updateTable({ note: (e.target as HTMLInputElement).value || undefined })}/>
							</div>
							<div class="row">
								<button type="button" class="btn-sm" onclick={() => clearTableSeats(T.id)} disabled={free === T.assignments.length}>{tr.editor.clearSeats}</button>
							</div>
						</section>
					{:else if selectedSeat}
						{@const sg = selectedSeat.assignment ? guests.find(x => x.id === selectedSeat.assignment) : null}
						<section>
							<div class="sec-title">{tr.editor.chairRef(seats.indexOf(selectedSeat) + 1)}</div>
							{#if sg}
								<div class="stat"><span>{sg.firstName} {sg.lastName}</span><button type="button" class="btn-sm" onclick={() => clearSeat({ seatId: selectedSeat.id })}>{tr.editor.remove}</button></div>
							{:else}
								<div class="stat"><span class="muted">{tr.editor.seatEmpty}</span><button type="button" class="btn-sm" onclick={() => { const r = { seatId: selectedSeat.id }; chairPopover = { ...r, x: wx(selectedSeat.x), y: wy(selectedSeat.y) }; guestSearch = ''; }}>{tr.editor.assign}</button></div>
							{/if}
						</section>
					{:else}
						<section>
							<div class="sec-title">{tr.editor.seatsTitle}</div>
							<p class="help-text">{guests.length ? tr.editor.selectTableForSeats : tr.editor.guestsEmpty}</p>
							{#if unseatedCount > 0}<p class="warn-text">{tr.editor.unseatedWarn(unseatedCount)}</p>{/if}
						</section>
					{/if}
				{/if}

				<!-- ── Check step: totals, warnings, save ── -->
				{#if step === 'check'}
					<section>
						<div class="sec-title">{tr.editor.summary}</div>
						{#if bounds}
							<div class="stat"><span>{tr.editor.stepRoom}</span><b>{bounds.w.toFixed(2)} × {bounds.h.toFixed(2)} m</b></div>
							<div class="stat"><span>{tr.editor.roomArea}</span><b>{roomArea(roomRects).toFixed(1)} m²</b></div>
							<div class="stat"><span>{tr.editor.perimeter}</span><b>{roomPerimeter.toFixed(1)} m</b></div>
						{/if}
						{#each zones as z}
							<div class="stat"><span>· {z.label || tr.editor.zoneOptions}</span><b>{polyAreaM2(z.points).toFixed(1)} m²</b></div>
						{/each}
						{#if zones.length && roomRects.length}
							<div class="stat"><span>{tr.editor.freeFloor}</span><b>{Math.max(0, roomArea(roomRects) - zonesArea).toFixed(1)} m²</b></div>
						{/if}
						<div class="stat"><span>{tr.editor.walls}</span><b>{walls.length}</b></div>
						<div class="stat"><span>{tr.editor.zones}</span><b>{zones.length}</b></div>
						<div class="stat"><span>{tr.editor.tables}</span><b>{tables.length}</b></div>
						<div class="stat"><span>{tr.editor.chairsCount}</span><b>{seats.length}</b></div>
						<div class="stat"><span>{tr.editor.totalSeats}</span><b>{totalSeats}</b></div>
						{#if allowGuests}<div class="stat"><span>{tr.editor.assigned}</span><b>{totalAssigned}/{guests.length} {tr.editor.guestsWord}</b></div>{/if}
						{#if floors.length > 1}
							<div class="stat stat-total"><span>{tr.editor.allFloors}</span><b>{allTables} · {allSeats} · {allWalls} · {allZones}</b></div>
						{/if}
					</section>
					{#if !partsConnected(roomRects)}<section><p class="warn-text">{tr.editor.roomDisconnected}</p></section>{/if}
					{#if collidingIds.size > 0 || stockOverages.length > 0 || (allowGuests && unseatedCount > 0)}
						<section>
							{#if collidingIds.size > 0}<p class="warn-text">{tr.editor.tablesClash(collidingIds.size)}</p>{/if}
							{#if stockOverages.length > 0}<p class="warn-text">{tr.serverErrors.tableInventoryExceeded(stockOverages.join(', '))}</p>{/if}
							{#if allowGuests && unseatedCount > 0}<p class="warn-text">{tr.editor.unseatedWarn(unseatedCount)}</p>{/if}
						</section>
					{/if}
					<section>
						{#if saveStateText}<div class="stat"><span>{tr.common.save}</span><b class="save-{saveState}">{saveStateText}</b></div>{/if}
						{#if printHref}
							<div class="row" style="flex-direction:column;align-items:stretch;gap:6px">
								<a class="btn-sm" style="text-align:center" href={printHref} target="_blank" rel="noopener">{tr.editor.printPlan}</a>
							</div>
						{/if}
					</section>
				{/if}

				<!-- ── Counts, always ── -->
				{#if step !== 'check'}
					<section class="summary">
						<div class="sec-title">{tr.editor.onThisFloor}</div>
						<div class="stat"><span>{tr.editor.walls}</span><b>{walls.length}</b></div>
						<div class="stat"><span>{tr.editor.zones}</span><b>{zones.length}</b></div>
						{#if editorMode !== 'room'}
							<div class="stat"><span>{tr.editor.tables}</span><b>{tables.length}</b></div>
							<div class="stat"><span>{tr.editor.totalSeats}</span><b>{totalSeats}</b></div>
						{/if}
						{#if allowGuests}<div class="stat"><span>{tr.editor.assigned}</span><b>{totalAssigned}/{guests.length}</b></div>{/if}
						{#if floors.length > 1}
							<div class="stat stat-total"><span>{tr.editor.allFloors}</span><b>{allTables} · {allSeats} · {allWalls} · {allZones}</b></div>
						{/if}
					</section>
				{/if}
			</div>

			<div class="panel-nav">
				{#if prevStepId}
					<button type="button" class="nav-prev" onclick={() => goStep(prevStepId!)} aria-label={tr.editor.prevStep}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
					</button>
				{/if}
				{#if nextStepId}
					<button type="button" class="nav-next" onclick={() => goStep(nextStepId!)}>
						{tr.editor.nextStep(stepLabel(nextStepId))}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg>
					</button>
				{:else if onSave}
					<button type="button" class="nav-next" onclick={onSave} disabled={saveState === 'saving'}>{saveLabel ?? tr.common.save}</button>
				{/if}
			</div>
		</aside>
	</div>
	{/if}

	<!-- The guest being dragged follows the pointer -->
	{#if dragGuest && dragGuestRecord}
		<div class="drag-chip" style="left:{dragGuest.x + 14}px; top:{dragGuest.y + 14}px" aria-hidden="true">
			<i>{dragGuestRecord.firstName[0] ?? ''}{dragGuestRecord.lastName[0] ?? ''}</i>
			{dragGuestRecord.firstName} {dragGuestRecord.lastName}
			{#if dragTarget}<span>→</span>{/if}
		</div>
	{/if}
</div>

<!-- ─── Styles ──────────────────────────────────────────────────────────────── -->
<style>
.app { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; background:var(--bg-base); position:relative; }

/* ── Small screens: the plan, read only, and where to edit it ── */
.app.narrow-app { overflow-y:auto; }
.narrow { display:flex; flex-direction:column; gap:14px; padding:16px; }
.narrow-msg { padding:12px 14px; border-radius:var(--radius-lg); background:var(--warning-dim); color:var(--text-base); font-size:13px; line-height:1.45; }
.narrow-msg b { display:block; font-weight:650; margin-bottom:2px; }
.narrow-msg p { margin:0; color:var(--text-muted); }
.narrow-floor { padding:0; border:0; }
.narrow-floor h3 { font-size:13px; font-weight:650; margin:0 0 6px; }
.narrow-facts { margin:0; font-size:12.5px; color:var(--text-muted); }
.narrow-print { align-self:flex-start; height:34px; padding:0 14px; }

/* ── Floors and help, inside the step strip ── */
.floors { display:flex; align-items:center; gap:3px; flex-shrink:0; }
.floor-tab {
	display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border-radius:var(--radius);
	border:1px solid transparent; background:transparent; font-size:12.5px; font-weight:500; color:var(--text-muted);
	cursor:pointer; font-family:inherit; white-space:nowrap;
}
.floor-tab:hover { background:var(--bg-hover); color:var(--text-base); }
.floor-tab.active { background:var(--accent-dim); color:var(--accent-ink); border-color:color-mix(in srgb, var(--accent) 45%, transparent); font-weight:600; }
.floor-tab-add { font-size:16px; padding:0 9px; }
.floor-tab-del { font-size:11px; padding:0 8px; }
.floor-tab-del:hover { background:var(--danger-dim); color:var(--danger); }
.floor-rename {
	height:30px; width:140px; padding:0 8px; border:1px solid var(--accent); border-radius:var(--radius);
	background:var(--bg-panel); color:var(--text-base); font:inherit; font-size:12.5px; outline:none;
	box-shadow:0 0 0 3px var(--accent-dim);
}
.floor-confirm { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-base); background:var(--warning-dim); padding:4px 8px; border-radius:var(--radius); white-space:nowrap; }
.fc-yes, .fc-no { height:24px; padding:0 8px; border-radius:var(--radius-sm); font:inherit; font-size:12px; font-weight:600; cursor:pointer; border:1px solid transparent; }
.fc-yes { background:var(--danger); color:var(--on-danger); }
.fc-no { background:transparent; color:var(--text-muted); }
.help-btn {
	width:30px; height:30px; border-radius:50%; border:1px solid var(--border); background:var(--bg-panel);
	color:var(--text-muted); font-weight:700; font-size:13px; cursor:pointer; font-family:inherit; margin-left:6px; flex-shrink:0;
}
.help-btn:hover, .help-btn.on { border-color:var(--accent); color:var(--accent-ink); }

/* ── Body ── */
.body { display:flex; flex:1; min-height:0; overflow:hidden; }
.tool-note { font-size:11.5px; line-height:1.45; color:var(--text-muted); padding:6px 10px 0; margin:0; }

/* ── Canvas ── */
.canvas-wrap { flex:1; position:relative; overflow:hidden; display:flex; flex-direction:column; min-width:0; }
.map-svg { flex:1; display:block; width:100%; height:100%; user-select:none; }
.c-cross { cursor:crosshair; }
.c-cell  { cursor:cell; }
.c-grab  { cursor:grab; }

/* ── Instruction bar ── */
.instr {
	position:absolute; left:50%; transform:translateX(-50%); top:12px; z-index:30;
	display:flex; align-items:center; gap:10px; max-width:calc(100% - 32px); box-sizing:border-box;
	height:38px; padding:0 8px 0 14px; border-radius:var(--radius-xl);
	background:var(--text-base); color:var(--bg-panel); font-size:13px; box-shadow:var(--shadow);
	white-space:nowrap; pointer-events:auto;
}
.instr-text { overflow:hidden; text-overflow:ellipsis; }
.instr-dot { width:8px; height:8px; border-radius:50%; background:var(--accent); flex-shrink:0; opacity:.55; }
.instr-dot.busy { opacity:1; animation:pulse 1.2s infinite; }
@keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.5); } }
.instr-btn {
	height:26px; padding:0 10px; border-radius:var(--radius); border:1px solid rgba(255,255,255,.25);
	background:rgba(255,255,255,.1); color:inherit; font:inherit; font-size:12px; font-weight:600; cursor:pointer;
}
.instr-btn:hover:not(:disabled) { background:rgba(255,255,255,.22); }
.instr-btn:disabled { opacity:.45; cursor:default; }
.instr-btn.ok { background:var(--success); border-color:var(--success); color:var(--on-success); }

.dim-label { font-size:12px; font-weight:650; fill:var(--text-base); paint-order:stroke; stroke:var(--bg-panel); stroke-width:4px; stroke-linejoin:round; font-variant-numeric:tabular-nums; }
.dim-edge { font-size:11px; font-weight:600; }
.dim-room { fill:#2f5f9e; }
.dim-zone { font-size:10px; }
.dim-line line { stroke:var(--text-muted); stroke-width:1; }
.toggle:disabled { cursor:default; opacity:1; }
.coach-pos { position:absolute; left:16px; top:66px; z-index:31; }
/* With rulers on, the overlays move clear of them. */
.canvas-wrap.rulers .instr { top:30px; }
.canvas-wrap.rulers .legend { top:78px; }
.canvas-wrap.rulers .coach-pos { left:34px; top:84px; }
.canvas-wrap.rulers .status-strip { left:30px; }
.mode-switch { display:flex; align-items:center; gap:8px; margin:8px 10px 0; padding:8px 10px; border-radius:var(--radius); background:var(--bg-panel2); font-size:12px; font-weight:500; color:var(--text-base); cursor:pointer; }
.mode-switch input { accent-color:var(--accent); margin:0; }
.tool-opts { display:flex; flex-direction:column; gap:8px; margin:8px 10px 0; padding:10px; border-radius:var(--radius); background:var(--bg-panel2); }
.opt-field { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:500; color:var(--text-base); }
.opt-field input { width:76px; height:28px; border:1px solid var(--border); border-radius:var(--radius); padding:0 8px; font:inherit; font-size:12.5px; background:var(--bg-panel); color:var(--text-base); box-sizing:border-box; }
.opt-field input:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-dim); }
.seg { display:flex; gap:2px; padding:2px; border-radius:var(--radius); background:var(--bg-panel); border:1px solid var(--border); }
.seg button { flex:1; height:26px; border:0; border-radius:var(--radius-sm); background:none; font:inherit; font-size:12px; font-weight:500; color:var(--text-muted); cursor:pointer; }
.seg button:hover { color:var(--text-base); }
.seg button.on { background:var(--accent-dim); color:var(--accent-ink); font-weight:600; }

/* Below the instruction bar, not beside it: a long instruction is centred and wide
   enough to run under a legend sitting at the same height. */
.legend { position:absolute; right:16px; top:60px; z-index:20; display:flex; gap:12px; font-size:11px; color:var(--text-muted); background:color-mix(in srgb, var(--bg-panel) 85%, transparent); padding:6px 10px; border-radius:var(--radius); border:1px solid var(--border); }
.legend span { display:inline-flex; align-items:center; gap:6px; }
.legend i { width:12px; height:12px; border-radius:3px; display:inline-block; }
.legend i.ring { background:none; border:2px solid var(--accent); border-radius:50%; box-sizing:border-box; }

/* ── Status strip (bottom-left) and zoom (bottom-right) ── */
.status-strip {
	position:absolute; left:12px; bottom:12px; z-index:20; display:flex; align-items:center; gap:6px; flex-wrap:wrap;
	max-width:calc(100% - 260px); font-size:12px; color:var(--text-muted);
}
.toggle {
	height:28px; padding:0 9px; border-radius:var(--radius); border:1px solid var(--border); background:var(--bg-panel);
	color:var(--text-muted); font:inherit; font-size:12px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;
}
.toggle:hover { border-color:var(--accent); color:var(--text-base); }
.toggle.on { background:var(--accent-dim); border-color:color-mix(in srgb, var(--accent) 45%, transparent); color:var(--accent-ink); }
.toggle:not(.on) svg { display:none; }
.coords { font-variant-numeric:tabular-nums; background:color-mix(in srgb, var(--bg-panel) 85%, transparent); padding:4px 8px; border-radius:var(--radius); }
.status-warn { color:var(--danger); font-weight:600; background:var(--danger-dim); padding:4px 8px; border-radius:var(--radius); }
.zoom {
	position:absolute; right:12px; bottom:12px; z-index:20; display:flex; gap:2px; padding:3px;
	background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm);
}
.zoom button { height:28px; min-width:28px; padding:0 8px; border:0; border-radius:var(--radius); background:transparent; color:var(--text-base); font:inherit; font-size:12px; font-weight:500; cursor:pointer; }
.zoom button:hover { background:var(--bg-hover); }
.zoom .pct { min-width:48px; font-variant-numeric:tabular-nums; color:var(--text-muted); }
.zoom .fit { color:var(--accent-ink); font-weight:600; }

/* ── Custom select (grid step) ── */
.custom-select {
	position:relative; display:inline-flex; align-items:center; gap:4px; height:28px; box-sizing:border-box;
	padding:0 8px; min-width:92px; border-radius:var(--radius);
	border:1px solid var(--border); background:var(--bg-panel);
	font-size:12px; color:var(--text-base); cursor:pointer;
	user-select:none; transition:border-color 0.15s;
}
.custom-select:hover { border-color:var(--accent); }
.custom-select-value { flex:1; white-space:nowrap; }
.custom-select-chevron { flex-shrink:0; color:var(--text-muted); }
.custom-select-dropdown {
	position:absolute; bottom:calc(100% + 4px); left:0; right:0;
	background:var(--bg-panel); border:1px solid var(--border);
	border-radius:var(--radius); padding:4px; box-shadow:var(--shadow);
	z-index:50;
}
.custom-select-option {
	display:block; width:100%; padding:5px 8px; border-radius:var(--radius-sm);
	font-size:12px; color:var(--text-base); text-align:left;
	background:none; border:none; cursor:pointer; font-family:inherit;
}
.custom-select-option:hover { background:var(--bg-panel2); }
.custom-select-option.selected { color:var(--accent-ink); font-weight:600; }

/* ── Chair popover ── */
.overlay { position:absolute; inset:0; z-index:40; }
.chair-popover {
	position:absolute; z-index:50; background:var(--bg-panel);
	border:1px solid var(--border); border-radius:var(--radius-lg);
	box-shadow:var(--shadow); width:250px;
	overflow:hidden;
}
.pop-header {
	display:flex; justify-content:space-between; align-items:center;
	padding:10px 12px 8px; font-size:12px; font-weight:600; color:var(--text-base);
	letter-spacing:-.03em; border-bottom:1px solid var(--border);
}
.pop-close { color:var(--text-muted); font-size:14px; line-height:1; padding:2px 4px; border-radius:var(--radius-sm); border:0; background:none; cursor:pointer; font-family:inherit; }
.pop-close:hover { background:var(--bg-panel2); color:var(--text-base); }
.pop-assigned {
	display:flex; align-items:center; gap:6px; padding:8px 12px;
	background:var(--success-dim); border-bottom:1px solid var(--border);
}
.pop-name { font-size:12px; font-weight:600; color:var(--success); flex:1; }
.pop-group { font-size:10px; color:var(--text-muted); background:var(--bg-panel2); padding:1px 5px; border-radius:var(--radius-sm); }
.pop-clear { font-size:11px; color:var(--danger); padding:3px 8px; border-radius:var(--radius-sm); background:var(--danger-dim); border:0; cursor:pointer; font-family:inherit; }
.pop-clear:hover { background:color-mix(in srgb, var(--danger) 15%, transparent); }
.pop-note {
	display:flex; align-items:flex-start; gap:6px; padding:6px 10px;
	font-size:11px; line-height:1.4; color:var(--warning);
	background:var(--warning-dim); border-radius:var(--radius-sm); margin:0 0 2px;
}
.pop-note svg { flex-shrink:0; margin-top:1px; }
.pop-empty { padding:8px 12px; font-size:12px; color:var(--text-muted); border-bottom:1px solid var(--border); }
.pop-search {
	display:block; width:100%; box-sizing:border-box; padding:8px 12px; border:none; border-bottom:1px solid var(--border);
	background:var(--bg-panel2); color:var(--text-base); font:inherit; font-size:12px; outline:none; border-radius:0;
}
.pop-search:focus { background:var(--bg-hover); }
.pop-list { max-height:200px; overflow-y:auto; }
.pop-guest {
	display:flex; align-items:center; gap:6px; padding:8px 12px; width:100%;
	font-size:12px; text-align:left; border:0; border-bottom:1px solid var(--border); background:none; cursor:pointer; font-family:inherit;
	transition:background 0.15s;
}
.pop-guest:hover { background:var(--bg-panel2); }
.pop-guest.current { background:var(--accent-dim); }
.pop-gname { flex:1; color:var(--text-base); }
.pop-ggroup { font-size:10px; color:var(--text-muted); background:var(--bg-panel2); padding:1px 5px; border-radius:var(--radius-sm); }
.pop-check { color:var(--accent-ink); font-weight:650; }

/* ── Help ── */
.ctx-menu {
	position:absolute; z-index:55; min-width:200px; max-width:260px; padding:4px; background:var(--bg-panel);
	border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow);
}
.ctx-title { padding:6px 10px 5px; font-size:11px; font-weight:650; letter-spacing:.04em; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-bottom:1px solid var(--border-subtle); margin-bottom:3px; }
.ctx-item {
	display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; height:30px; padding:0 10px;
	border:0; border-radius:var(--radius); background:none; color:var(--text-base); font:inherit; font-size:12.5px; text-align:left; cursor:pointer;
}
.ctx-item:hover:not(:disabled) { background:var(--bg-hover); }
.ctx-item.danger { color:var(--danger); }
.ctx-item.danger:hover:not(:disabled) { background:var(--danger-dim); }
.ctx-item:disabled { opacity:.4; cursor:default; }
.help-pop {
	position:absolute; right:16px; top:60px; z-index:45; width:300px; background:var(--bg-panel); border:1px solid var(--border);
	border-radius:var(--radius-lg); box-shadow:var(--shadow); padding:10px 12px 12px; font-size:12px; color:var(--text-base);
}
.help-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.help-head b { font-size:13px; }
.help-pop dl { margin:0; display:flex; flex-direction:column; gap:5px; }
.help-pop dl > div { display:flex; gap:10px; align-items:center; }
.help-pop dt { min-width:92px; display:flex; gap:3px; align-items:center; color:var(--text-muted); }
.help-pop dd { margin:0; }
.help-pop p { margin:10px 0 0; color:var(--text-muted); line-height:1.4; }
kbd {
	font-family:inherit; font-size:10.5px; font-weight:600; color:var(--text-muted); padding:0 5px; line-height:1.6;
	border:1px solid var(--border); border-bottom-width:2px; border-radius:var(--radius-sm); background:var(--bg-panel2); display:inline-block;
}

/* ── Right panel ── */
.panel {
	width:300px; background:var(--bg-panel); border-left:1px solid var(--border);
	flex-shrink:0; display:flex; flex-direction:column; overflow:hidden; min-height:0;
}
.panel-scroll { flex:1; overflow-y:auto; min-height:0; display:flex; flex-direction:column; }
section { padding:12px 14px; border-bottom:1px solid var(--border-subtle); }
.sec-title {
	font-size:11px; font-weight:650; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;
}
.sec-title-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.muted { color:var(--text-muted); font-size:12px; }
.help-text { font-size:12px; color:var(--text-muted); line-height:1.5; margin:0 0 6px; }
.warn-text { font-size:12px; color:var(--warning); font-weight:600; line-height:1.45; margin:0 0 4px; }
.row { display:flex; gap:6px; align-items:center; }
.field { display:flex; flex-direction:column; gap:4px; margin-bottom:9px; }
.field label { font-size:11.5px; font-weight:500; color:var(--text-muted); }
.field input[type="text"], .field input[type="number"], .field select {
	height:30px; border:1px solid var(--border); border-radius:var(--radius); padding:0 9px; font:inherit; font-size:12.5px;
	background:var(--bg-panel); color:var(--text-base); width:100%; box-sizing:border-box;
}
.field input:focus, .field select:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-dim); }
.field-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.val { font-size:11px; color:var(--accent-ink); min-width:44px; font-variant-numeric:tabular-nums; }

/* Progress list */
.progress { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
.progress button { display:flex; gap:10px; align-items:flex-start; width:100%; padding:6px 6px; border-radius:var(--radius); border:0; background:none; text-align:left; cursor:pointer; font-family:inherit; color:var(--text-base); }
.progress button:hover { background:var(--bg-hover); }
.progress li.active button { background:var(--accent-dim); }
.progress i { width:18px; height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-style:normal; font-size:10px; font-weight:700; flex-shrink:0; margin-top:1px; background:var(--bg-panel2); color:var(--text-subtle); }
.progress li.done i { background:var(--success-dim); color:var(--success); }
.progress li.active i { background:var(--accent); color:var(--accent-contrast); }
.progress span { display:flex; flex-direction:column; gap:1px; min-width:0; }
.progress b { font-size:12.5px; font-weight:600; }
.progress li.active b { color:var(--accent-ink); }
.progress em { font-style:normal; font-size:11.5px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Object lists */
.obj-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
.obj-list button { display:flex; align-items:center; gap:8px; width:100%; height:28px; padding:0 6px; border-radius:var(--radius-sm); border:0; background:none; font:inherit; font-size:12.5px; color:var(--text-base); text-align:left; cursor:pointer; }
.obj-list button:hover { background:var(--bg-hover); }
.obj-list button.on { background:var(--accent-dim); color:var(--accent-ink); font-weight:600; }
.obj-list i { width:12px; height:12px; border-radius:3px; display:inline-block; flex-shrink:0; }
.room-parts { list-style:none; margin:0 0 6px; padding:0; display:flex; flex-direction:column; gap:3px; }
.room-parts li { display:flex; align-items:center; gap:4px; border-radius:var(--radius-sm); }
.room-parts li.on .part-pick { background:var(--accent-dim); color:var(--accent-ink); font-weight:600; }
.part-pick { flex:1; text-align:left; height:28px; padding:0 8px; border:0; border-radius:var(--radius-sm); background:none; font:inherit; font-size:12px; color:var(--text-base); cursor:pointer; }
.part-pick:hover { background:var(--bg-hover); }
.part-del { font-size:14px; line-height:1; color:var(--text-muted); padding:3px 7px; border:0; background:none; border-radius:var(--radius-sm); cursor:pointer; font-family:inherit; }
.part-del:hover { color:var(--danger); background:var(--danger-dim); }

/* Seats of the selected table */
.seats { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.seats li { display:flex; align-items:center; gap:8px; height:32px; font-size:12.5px; border-radius:var(--radius-sm); padding:0 4px; }
.seats li.drop { background:var(--accent-dim); }
.seats i { width:20px; height:20px; border-radius:50%; background:var(--success); color:var(--on-success); display:inline-flex; align-items:center; justify-content:center; font-style:normal; font-size:10px; font-weight:700; flex-shrink:0; }
.seats li.empty i { background:var(--bg-panel2); color:var(--text-muted); }
.seats .nm { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.seats .nm em { font-style:normal; color:var(--text-muted); font-size:11px; }
.seats .x { font-size:15px; line-height:1; color:var(--text-subtle); padding:2px 6px; border:0; background:none; border-radius:var(--radius-sm); cursor:pointer; font-family:inherit; }
.seats .x:hover { background:var(--danger-dim); color:var(--danger); }
.seats .assign { height:24px; padding:0 8px; font:inherit; font-size:11px; font-weight:600; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-panel); color:var(--accent-ink); cursor:pointer; }
.seats .assign:hover { border-color:var(--accent); }
.suggest { margin-top:8px; padding:8px 10px; border-radius:var(--radius); background:var(--warning-dim); }
.suggest p { margin:0 0 6px; font-size:12px; line-height:1.4; color:var(--text-base); }

/* Swatches, dots, stats, buttons (carried over) */
.swatches { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:4px; }
.swatch { width:22px; height:22px; border-radius:50%; border:2px solid transparent; cursor:pointer; transition:transform .1s; padding:0; }
.swatch:hover { transform:scale(1.15); }
.swatch.on { border-color:var(--text-base); transform:scale(1.15); }
.swatches input[type="color"] { width:26px; height:26px; border:1px solid var(--border); border-radius:50%; padding:0; background:none; cursor:pointer; }
.seat-summary { margin:4px 0 8px; }
.seat-summary span { font-size:11px; color:var(--text-muted); }
.seat-dots { display:flex; flex-wrap:wrap; gap:3px; margin-top:5px; }
.dot { width:9px; height:9px; border-radius:50%; background:var(--bg-panel2); border:1px solid var(--border); }
.dot.filled { background:var(--accent); border-color:var(--accent); }
.stat { display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-muted); padding:3px 0; gap:8px; }
.stat b { color:var(--text-base); font-weight:600; text-align:right; }
.stat b.save-saved { color:var(--success); }
.stat b.save-dirty { color:var(--warning); }
.stat-total { border-top:1px solid var(--border); margin-top:6px; padding-top:6px; opacity:.85; }
.summary { margin-top:auto; border-bottom:0; }
.btn-del {
	width:100%; margin-top:6px; padding:7px 10px; border-radius:var(--radius); font-size:12px; font-weight:600;
	background:var(--danger-dim); color:var(--danger); border:0; cursor:pointer; font-family:inherit;
}
.btn-del:hover { background:color-mix(in srgb, var(--danger) 15%, transparent); }
.btn-add {
	width:100%; padding:9px 10px; border-radius:var(--radius); font-size:13px; font-weight:600;
	background:var(--accent); color:var(--accent-contrast); border:0; cursor:pointer; font-family:inherit; transition:background .15s;
}
.btn-add:hover:not(:disabled) { background:var(--accent-hover); }
.btn-add:disabled { opacity:.5; cursor:default; }
.btn-sm {
	height:28px; padding:0 10px; border-radius:var(--radius); font-size:12px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;
	background:var(--accent-dim); color:var(--accent-ink); border:0; cursor:pointer; font-family:inherit;
}
.btn-sm:hover:not(:disabled) { background:color-mix(in srgb, var(--accent) 22%, transparent); text-decoration:none; }
.btn-sm:disabled { opacity:.5; cursor:default; }

.inventory-list { display:flex; flex-direction:column; gap:4px; margin-top:2px; }
.inventory-item {
	display:flex; align-items:center; gap:10px; padding:7px 8px; border:1px solid var(--border); border-radius:var(--radius);
	background:var(--bg-panel); text-align:left; cursor:pointer; font-family:inherit; width:100%; box-sizing:border-box;
}
.inventory-item:hover { border-color:var(--accent); }
.inventory-item.active { border-color:var(--accent); background:var(--accent-dim); }
.inv-preview { width:36px; height:36px; flex-shrink:0; }
.inv-preview svg { width:100%; height:100%; }
.inv-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
.inv-name { font-size:12px; font-weight:600; letter-spacing:-.03em; color:var(--text-base); }
.inv-detail { font-size:10.5px; color:var(--text-muted); }
.inv-stock { font-size:10px; font-weight:600; color:var(--accent-ink); }
.inv-stock.none { color:var(--danger); }
.inventory-item.spent .inv-preview { opacity:.4; }
.chair-limit-hint { font-size:11px; color:var(--text-muted); margin:0 0 6px; }
.inv-locked-info { font-size:11.5px; color:var(--text-muted); background:var(--bg-panel2); padding:6px 8px; border-radius:var(--radius-sm); margin-bottom:9px; text-align:center; }

/* Step navigation */
.panel-nav { display:flex; gap:6px; padding:10px 14px; border-top:1px solid var(--border); background:var(--bg-panel); flex-shrink:0; }
.nav-prev { width:36px; height:36px; border-radius:var(--radius); border:1px solid var(--border); background:var(--bg-panel); color:var(--text-muted); cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.nav-prev:hover { border-color:var(--accent); color:var(--accent-ink); }
.nav-next {
	flex:1; height:36px; border-radius:var(--radius); border:1px solid var(--accent); background:var(--accent); color:var(--accent-contrast);
	font:inherit; font-size:13px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px;
}
.nav-next:hover:not(:disabled) { background:var(--accent-hover); }
.nav-next:disabled { opacity:.5; cursor:default; }

/* Drag chip */
.drag-chip {
	position:fixed; z-index:200; pointer-events:none; display:flex; align-items:center; gap:8px; padding:6px 10px 6px 6px;
	border-radius:var(--radius-xl); background:var(--bg-panel); border:1px solid var(--accent); box-shadow:var(--shadow); font-size:12.5px; color:var(--text-base);
}
.drag-chip i { width:22px; height:22px; border-radius:50%; background:var(--accent-dim); color:var(--accent-ink); display:inline-flex; align-items:center; justify-content:center; font-style:normal; font-size:10px; font-weight:700; }
.drag-chip span { color:var(--accent-ink); font-weight:700; }

/* ── Rulers (optional) ── */
.ruler-corner { position:absolute; left:0; top:0; width:20px; height:20px; background:var(--bg-panel); border-right:1px solid var(--border); border-bottom:1px solid var(--border); z-index:15; }
.ruler-top { position:absolute; left:20px; right:0; top:0; height:20px; background:var(--bg-panel); border-bottom:1px solid var(--border); overflow:hidden; z-index:14; pointer-events:none; }
.ruler-left { position:absolute; left:0; top:20px; bottom:0; width:20px; background:var(--bg-panel); border-right:1px solid var(--border); overflow:hidden; z-index:14; pointer-events:none; }
.ruler-tick { position:absolute; bottom:0; width:1px; background:var(--editor-tick); }
.ruler-tick-major { height:10px; }
.ruler-tick-minor { height:5px; background:var(--editor-tick-minor); }
.ruler-label { position:absolute; left:3px; top:-14px; font-size:9px; color:var(--editor-label); font-variant-numeric:tabular-nums; white-space:nowrap; }
.ruler-tick-v { position:absolute; right:0; height:1px; background:var(--editor-tick); }
.ruler-tick-major-v { width:6px; }
.ruler-tick-minor-v { width:5px; background:var(--editor-tick-minor); }
.ruler-label-v { position:absolute; right:7px; top:1px; font-size:9px; line-height:1; white-space:nowrap; color:var(--editor-label); font-variant-numeric:tabular-nums; }
.ruler-cursor-h { position:absolute; top:0; bottom:0; width:1px; background:var(--accent); opacity:.7; }
.ruler-cursor-v { position:absolute; left:0; right:0; height:1px; background:var(--accent); opacity:.7; }

@media (max-width: 1280px) {
	.panel { width:264px; }
	.legend { display:none; }
}
</style>
