// A hall's opening hours, the same shape in the console, on the server and on the
// public pages: all seven days, always. The console used to show 09:00–22:00 for a
// day nobody had touched but stored only the days that were edited, so the public
// pages showed those other days as closed or left them out (B74).

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface DayHours { open: boolean; from: string; to: string }
export type OpeningHours = Record<DayKey, DayHours>;

/** What the console shows for a day that has never been set. */
export const DEFAULT_DAY_HOURS: Readonly<DayHours> = Object.freeze({ open: true, from: '09:00', to: '22:00' });

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A time as HH:MM, or null. Accepts H:MM and HH:MM:SS (some browsers post seconds). */
export function normaliseTime(raw: unknown): string | null {
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(raw ?? '').trim());
	if (!m) return null;
	const t = `${m[1].padStart(2, '0')}:${m[2]}`;
	return TIME.test(t) ? t : null;
}

/**
 * All seven days, in order. A day that is missing or malformed gets the default;
 * a closed day keeps the times it had (so re-opening it restores them) or the
 * default ones. Accepts the stored JSON text or an already parsed object.
 */
export function completeOpeningHours(raw: unknown): OpeningHours {
	let src: unknown = raw;
	if (typeof raw === 'string') {
		try { src = JSON.parse(raw); } catch { src = null; }
	}
	const obj = src && typeof src === 'object' && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
	const out = {} as OpeningHours;
	for (const day of DAY_KEYS) {
		const d = obj[day] as Partial<Record<keyof DayHours, unknown>> | undefined;
		if (!d || typeof d !== 'object') { out[day] = { ...DEFAULT_DAY_HOURS }; continue; }
		out[day] = {
			open: d.open === undefined ? DEFAULT_DAY_HOURS.open : d.open === true || d.open === 'true' || d.open === 1,
			from: normaliseTime(d.from) ?? DEFAULT_DAY_HOURS.from,
			to: normaliseTime(d.to) ?? DEFAULT_DAY_HOURS.to
		};
	}
	return out;
}

/** The first open day whose times are not HH:MM, or null when every day is fine. */
export function invalidOpeningDay(raw: unknown): DayKey | null {
	let src: unknown = raw;
	if (typeof raw === 'string') {
		try { src = JSON.parse(raw); } catch { return null; }
	}
	if (!src || typeof src !== 'object') return null;
	for (const day of DAY_KEYS) {
		const d = (src as Record<string, { open?: unknown; from?: unknown; to?: unknown }>)[day];
		if (!d || typeof d !== 'object' || d.open === false) continue;
		if ((d.from !== undefined && !normaliseTime(d.from)) || (d.to !== undefined && !normaliseTime(d.to))) return day;
	}
	return null;
}
