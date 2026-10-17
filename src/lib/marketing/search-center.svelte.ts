import type { MapCenter } from './discovery';

/**
 * The place the visitor is actually thinking about.
 *
 * Discovery ranks partner venues by distance, and the distance has to be measured
 * from somewhere. Using the map origin as that "somewhere" is the bug this exists to
 * fix: someone who types "Kosice" was being shown the partners nearest Prague.
 *
 * So the typed query is geocoded through our own /api/geocode proxy (the browser
 * never talks to Nominatim directly) and the answer becomes the ranking centre. The
 * lookup is:
 *
 *  * debounced, so typing a city name is one request and not one per keystroke;
 *  * cached per normalised query at module scope, so going back and forth between
 *    the landing page and the explorer re-uses the answer instead of re-asking;
 *  * never awaited by rendering. Results show immediately against whatever centre
 *    is known at the time and re-rank when the lookup resolves.
 *
 * A query that resolves to nothing yields null, which is a real answer: it means
 * "rank by the fair daily rotation", not "rank around Prague".
 */

export interface SearchCenter {
	/** The geocoded centre of the current query, or null when there is none. */
	readonly center: MapCenter | null;
	/** The place name the geocoder returned, for telling the visitor what "near" means. */
	readonly label: string | null;
	/** True while a lookup is outstanding. Rendering never waits on it. */
	readonly pending: boolean;
}

interface Answer {
	center: MapCenter | null;
	label: string | null;
}

const DEBOUNCE_MS = 450;

/** Below this a query is a fragment, not a place, and is not worth a request. */
const MIN_QUERY = 3;

/** Matches the server's own cap; a longer string cannot be an address. */
const MAX_QUERY = 200;

const MAX_CACHED = 80;

const NOTHING: Answer = { center: null, label: null };

/** Module scope: an answer outlives the component, so navigation does not re-ask. */
const answers = new Map<string, Answer>();

function cacheKey(query: string): string {
	return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function remember(key: string, answer: Answer): void {
	if (answers.size >= MAX_CACHED) {
		const oldest = answers.keys().next();
		if (!oldest.done) answers.delete(oldest.value);
	}
	answers.set(key, answer);
}

/**
 * Returns undefined when the lookup could not be completed at all -- offline, rate
 * limited, aborted. That is not the same as "no such place" and must not be cached
 * as one, or a single 429 would poison the query for the rest of the session.
 */
async function lookup(query: string, signal: AbortSignal): Promise<Answer | undefined> {
	let payload: unknown;
	try {
		const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
			signal,
			headers: { accept: 'application/json' }
		});
		if (!response.ok) return undefined;
		payload = await response.json();
	} catch {
		return undefined;
	}

	const result = (payload as { result?: unknown } | null)?.result as
		| { latitude?: unknown; longitude?: unknown; label?: unknown }
		| null
		| undefined;
	if (!result) return NOTHING;

	const latitude = Number(result.latitude);
	const longitude = Number(result.longitude);
	if (
		!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
		Math.abs(latitude) > 90 || Math.abs(longitude) > 180
	) return NOTHING;

	return { center: { latitude, longitude }, label: typeof result.label === 'string' ? result.label : null };
}

/**
 * Track a reactive query string and resolve it to a centre.
 *
 * Call this during component initialisation. While a new lookup is outstanding the
 * previous answer is kept rather than cleared, so the map and the result order do
 * not flicker back to "unknown" between two keystrokes.
 */
export function createSearchCenter(query: () => string): SearchCenter {
	let answer = $state<Answer>(NOTHING);
	let pending = $state(false);

	$effect(() => {
		const typed = query().trim();
		const key = cacheKey(typed);

		if (key.length < MIN_QUERY || key.length > MAX_QUERY) {
			answer = NOTHING;
			pending = false;
			return;
		}

		const known = answers.get(key);
		if (known) {
			answer = known;
			pending = false;
			return;
		}

		pending = true;
		const controller = new AbortController();
		const timer = setTimeout(() => {
			void lookup(typed, controller.signal).then((found) => {
				if (controller.signal.aborted) return;
				pending = false;
				// A failed lookup leaves the previous centre in place; it is not evidence
				// that the place does not exist.
				if (!found) return;
				remember(key, found);
				answer = found;
			});
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	return {
		get center() {
			return answer.center;
		},
		get label() {
			return answer.label;
		},
		get pending() {
			return pending;
		}
	};
}
