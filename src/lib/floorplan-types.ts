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
	chairsOnShortSide?: boolean; // legacy compat
}
export interface Guest {
	id: string; firstName: string; lastName: string; group?: string;
}

export interface FloorData {
	id: string;
	name: string;
	walls: WallObj[];
	zones: ZoneObj[];
	tables: TableObj[];
	bounds: BoundsRect | null;
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

/** Convert any floorplan JSON (legacy or multi-floor) into MultiFloorState */
export function migrateToMultiFloor(raw: unknown): MultiFloorState {
	if (!raw || typeof raw !== 'object') {
		return {
			version: 2,
			floors: [{ id: crypto.randomUUID(), name: 'Floor 1', walls: [], zones: [], tables: [], bounds: null }],
			guests: [],
		};
	}
	const obj = raw as Record<string, unknown>;

	// Already multi-floor format
	if (obj.version === 2 && Array.isArray(obj.floors)) {
		return obj as unknown as MultiFloorState;
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
			bounds: (obj.bounds as BoundsRect) ?? null,
		}],
		guests: Array.isArray(obj.guests) ? obj.guests as Guest[] : [],
	};
}
