// Opening hours as the public pages and the booking calendar read them.
//
// The hall editor stores only the days an operator actually touched. A day that was
// never edited shows as open 09:00–22:00 in the console (its default), but the public
// pages printed '—' for it, or left it out, so a venue that only changed Monday looked
// closed the rest of the week. Every reader goes through here, so a missing day means
// the console's default everywhere, and only an explicit `open: false` closes a day.

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface DayHours {
	open: boolean;
	from: string;
	to: string;
}

/** What the console shows for a day nobody has edited. */
export const DEFAULT_DAY_HOURS: DayHours = { open: true, from: '09:00', to: '22:00' };

/** JS getDay() index (0 = Sunday) for each stored key. */
const JS_DOW: Record<DayKey, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function parse(raw: unknown): Record<string, Partial<DayHours>> | null {
	let v = raw;
	if (typeof v === 'string') {
		if (!v.trim()) return null;
		try { v = JSON.parse(v); } catch { return null; }
	}
	if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
	return v as Record<string, Partial<DayHours>>;
}

/**
 * The full week, Monday first, with untouched days filled in from the console default.
 * Null when the venue never set opening hours at all (the section is then not shown).
 */
export function resolveOpeningHours(raw: unknown): { day: DayKey; hours: DayHours }[] | null {
	const stored = parse(raw);
	if (!stored || Object.keys(stored).length === 0) return null;
	return DAY_KEYS.map((day) => {
		// Older rows may use the JS day number as the key.
		const d = stored[day] ?? stored[String(JS_DOW[day])];
		if (!d || typeof d !== 'object') return { day, hours: { ...DEFAULT_DAY_HOURS } };
		const open = d.open !== false;
		return {
			day,
			hours: {
				open,
				from: typeof d.from === 'string' && d.from ? d.from : DEFAULT_DAY_HOURS.from,
				to: typeof d.to === 'string' && d.to ? d.to : DEFAULT_DAY_HOURS.to
			}
		};
	});
}

/** JS getDay() numbers of the days the venue explicitly marked closed. */
export function closedWeekdays(raw: unknown): number[] {
	const stored = parse(raw);
	if (!stored) return [];
	const out: number[] = [];
	for (const day of DAY_KEYS) {
		const d = stored[day] ?? stored[String(JS_DOW[day])];
		if (d && typeof d === 'object' && d.open === false) out.push(JS_DOW[day]);
	}
	return out.sort((a, b) => a - b);
}
