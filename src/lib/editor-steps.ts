/**
 * The guided floor-plan editor: which steps a context has, and which tools each
 * step shows.
 *
 * The editor is one component used in three places, which used to be told apart
 * by a bag of flags (hidden tools, locked walls, guests on or off). Those flags
 * still gate what may be changed; this module decides what the user is WALKED
 * THROUGH, so a first-time venue manager sees two or three tools at a time and an
 * instruction for each, instead of eight verbs in a column.
 *
 *   room      the hall's own plan: the room shape, then walls and pillars, then
 *             zones, then a check before saving. No tables — those belong to a
 *             template or an event.
 *   template  a reusable layout on a locked room: tables, then chairs and zones,
 *             then a check.
 *   event     a booked event: tables, chairs and zones, then the guests, then a
 *             check before printing.
 *   seating   a booked event whose tables the venue fixes (the hall does not let
 *             clients arrange their own): only the guests, then the check.
 */

export type EditorMode = 'room' | 'template' | 'event' | 'seating';

export type StepId = 'room' | 'walls' | 'zones' | 'tables' | 'chairs' | 'guests' | 'check';

export type Tool =
	| 'select'
	| 'bounds'   // the room rectangle(s)
	| 'wall'
	| 'pillar'
	| 'zone'
	| 'table'
	| 'chair'
	| 'eraser'
	| 'measure';

export const STEPS_BY_MODE: Record<EditorMode, StepId[]> = {
	room: ['room', 'walls', 'zones', 'check'],
	template: ['tables', 'chairs', 'check'],
	event: ['tables', 'chairs', 'guests', 'check'],
	seating: ['guests', 'check']
};

export function stepsFor(mode: EditorMode): StepId[] {
	return STEPS_BY_MODE[mode];
}

export interface ToolContext {
	/** The hall has defined table types (an inventory). */
	hasTableTypes: boolean;
	/** Only inventory tables may be placed (templates and events). */
	tablesFromTypesOnly: boolean;
	/** Zones may be drawn in this context. */
	allowZones: boolean;
	/** The venue shell (room, walls) may be changed in this context. */
	shellEditable: boolean;
}

/**
 * The tools a step offers, in display order. Select is always first and
 * Measure always last, so the eye finds them in the same place in every step.
 */
export function toolsFor(step: StepId, ctx: ToolContext): Tool[] {
	const tools: (Tool | null)[] = (() => {
		switch (step) {
			case 'room':
				return ['select', ctx.shellEditable ? 'bounds' : null, 'measure'];
			case 'walls':
				return ['select', ctx.shellEditable ? 'wall' : null, ctx.shellEditable ? 'pillar' : null, ctx.shellEditable ? 'eraser' : null, 'measure'];
			case 'zones':
				return ['select', ctx.allowZones ? 'zone' : null, ctx.allowZones ? 'eraser' : null, 'measure'];
			case 'tables':
				// With no inventory and inventory-only placement there is nothing to
				// place; the step then only explains where table types are defined.
				return ['select', ctx.hasTableTypes || !ctx.tablesFromTypesOnly ? 'table' : null, 'eraser', 'measure'];
			case 'chairs':
				return ['select', 'chair', ctx.allowZones ? 'zone' : null, 'eraser', 'measure'];
			case 'guests':
				return ['select'];
			case 'check':
				return ['select'];
		}
	})();
	return tools.filter((t): t is Tool => t !== null);
}

/** Which step a tool naturally belongs to, for jumping from a selection. */
export function stepForTool(tool: Tool, steps: StepId[]): StepId | null {
	const prefer: Partial<Record<Tool, StepId[]>> = {
		bounds: ['room'],
		wall: ['walls'],
		pillar: ['walls'],
		zone: ['zones', 'chairs'],
		table: ['tables'],
		chair: ['chairs']
	};
	for (const s of prefer[tool] ?? []) if (steps.includes(s)) return s;
	return null;
}

/** Single-key shortcuts. Letters are what the tool cards print beside their names. */
export const TOOL_KEYS: Record<Tool, string> = {
	select: 'V',
	bounds: 'R',
	wall: 'W',
	pillar: 'P',
	zone: 'Z',
	table: 'T',
	chair: 'C',
	eraser: 'E',
	measure: 'M'
};

export function toolForKey(key: string): Tool | null {
	const k = key.toUpperCase();
	for (const [tool, letter] of Object.entries(TOOL_KEYS) as [Tool, string][]) if (letter === k) return tool;
	return null;
}
