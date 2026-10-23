// ─── Shared floorplan types & migration utilities ─────────────────────────

export type Point = { x: number; y: number };
export type TableShape = 'rect' | 'round';
export interface BoundsRect { x: number; y: number; w: number; h: number }

export interface WallObj { id: string; points: Point[] }
export interface ZoneObj { id: string; points: Point[]; color: string; label: string }
export interface TableObj {
	id: string; x: number; y: number;
	width: number; height: number; radius: number;
	shape: TableShape; chairs: number; rotation: number; label: string;
	chairsTop: number; chairsBottom: number; chairsLeft: number; chairsRight: number;
	chairSpacing: number;
	assignments: (string | null)[];
	typeId?: string;
	note?: string;       // a note for staff ("one high chair"), shown in the seating editor
	/** The table's number (T1, T2…), unique across a layout's floors and kept when
	 *  other tables come and go, so seat chips, the manifest and the room agree. */
	num?: number;
	chairsOnShortSide?: boolean; // legacy compat
}
export interface Guest {
	id: string; firstName: string; lastName: string; group?: string;
	note?: string;       // free-form note (dietary, accessibility, …); auto-seeded from RSVP allergies
}

/** A chair placed on its own (not attached to a table) — e.g. concert seating. */
export interface SeatObj {
	id: string; x: number; y: number; rotation: number;
	assignment: string | null;   // guest id, like a table chair
	label?: string;
}

export interface FloorData {
	id: string;
	name: string;
	walls: WallObj[];
	zones: ZoneObj[];
	tables: TableObj[];
	seats?: SeatObj[];     // standalone chairs (optional for legacy compat)
	/** The room's bounding box. With `boundsParts` it frames them; without, it IS the room. */
	bounds: BoundsRect | null;
	/** A room made of several rectangles (an L, a U…), joined into one shape. Absent
	 *  when the room is a single rectangle. See floorplan-geometry.ts. */
	boundsParts?: BoundsRect[];
}

export interface MultiFloorState {
	version: 2;
	floors: FloorData[];
	guests: Guest[];
}

/** Migrate legacy tables that have `chairs` + `chairsOnShortSide` but no per-side counts */
export function migrateChairCounts(t: TableObj): TableObj {
	if (t.shape === 'round') return t;
	if ((t.chairsTop ?? 0) + (t.chairsBottom ?? 0) + (t.chairsLeft ?? 0) + (t.chairsRight ?? 0) > 0) return t;
	const n = Number(t.chairs) || 0;
	if (n === 0) return { ...t, chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0 };
	const W = Number(t.width), H = Number(t.height);
	if (t.chairsOnShortSide) {
		const P = 2 * (W + H);
		const top = Math.max(0, Math.round(n * W / P));
		const bot = Math.max(0, Math.round(n * W / P));
		const rem = n - top - bot;
		return { ...t, chairsTop: top, chairsBottom: bot, chairsRight: Math.ceil(rem / 2), chairsLeft: rem - Math.ceil(rem / 2) };
	}
	if (W >= H) return { ...t, chairsTop: Math.ceil(n / 2), chairsBottom: n - Math.ceil(n / 2), chairsLeft: 0, chairsRight: 0 };
	return { ...t, chairsTop: 0, chairsBottom: 0, chairsLeft: Math.ceil(n / 2), chairsRight: n - Math.ceil(n / 2) };
}

/** Floors and zones drawn before their default names were translated are stored as
 *  'Floor 2' / 'Zone 3'. Show such a default in the viewer's language (`label(2)`);
 *  a name someone typed is kept as it is. */
export function floorDisplayName(name: string | null | undefined, index: number, label: (n: number) => string): string {
	const s = (name ?? '').trim();
	if (!s) return label(index + 1);
	const m = /^Floor (\d+)$/.exec(s);
	return m ? label(Number(m[1])) : s;
}

export function zoneDisplayLabel(name: string | null | undefined, label: (n: number) => string): string {
	const s = name ?? '';
	const m = /^Zone (\d+)$/.exec(s.trim());
	return m ? label(Number(m[1])) : s;
}

/** Convert any floorplan JSON (legacy or multi-floor) into MultiFloorState.
 *  Accepts either a parsed object or a raw JSON string (DB columns are often
 *  passed straight through without `fromJson`). */
export function migrateToMultiFloor(raw: unknown): MultiFloorState {
	if (typeof raw === 'string') {
		try { raw = JSON.parse(raw); } catch { raw = null; }
	}
	if (!raw || typeof raw !== 'object') {
		return {
			version: 2,
			floors: [{ id: crypto.randomUUID(), name: 'Floor 1', walls: [], zones: [], tables: [], seats: [], bounds: null }],
			guests: [],
		};
	}
	const obj = raw as Record<string, unknown>;

	// Already multi-floor format
	if (obj.version === 2 && Array.isArray(obj.floors)) {
		const state = obj as unknown as MultiFloorState;
		// Ensure every floor has a seats array (added after the original v2 format).
		for (const f of state.floors) if (!Array.isArray(f.seats)) f.seats = [];
		return state;
	}

	// Legacy single-floor format: wrap in floors array
	return {
		version: 2,
		floors: [{
			id: crypto.randomUUID(),
			name: 'Floor 1',
			walls: Array.isArray(obj.walls) ? obj.walls as WallObj[] : [],
			zones: Array.isArray(obj.zones) ? obj.zones as ZoneObj[] : [],
			tables: (Array.isArray(obj.tables) ? obj.tables as TableObj[] : []).map(migrateChairCounts),
			seats: Array.isArray(obj.seats) ? obj.seats as SeatObj[] : [],
			bounds: (obj.bounds as BoundsRect) ?? null,
			...(Array.isArray(obj.boundsParts) ? { boundsParts: obj.boundsParts as BoundsRect[] } : {}),
		}],
		guests: Array.isArray(obj.guests) ? obj.guests as Guest[] : [],
	};
}

/** Total seat count across every floor of a layout, counted the way the editor
 *  counts it: a round table seats its `chairs`, a rectangular one the sum of its
 *  per-side counts (else the legacy flat `chairs`), and every standalone chair is
 *  a seat too. Accepts raw stored JSON (string or parsed) — migrates to the v2
 *  multi-floor shape first. */
export function countSeats(raw: unknown): number {
	const state = migrateToMultiFloor(raw);
	let seats = 0;
	for (const floor of state.floors) {
		for (const t of floor.tables ?? []) {
			if (t.shape === 'round') { seats += Number(t.chairs) || 0; continue; }
			const perSide = (Number(t.chairsTop) || 0) + (Number(t.chairsBottom) || 0) +
				(Number(t.chairsLeft) || 0) + (Number(t.chairsRight) || 0);
			seats += perSide || (Number(t.chairs) || 0);
		}
		seats += Array.isArray(floor.seats) ? floor.seats.length : 0;
	}
	return seats;
}
