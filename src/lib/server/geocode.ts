import { dbFirst, dbRun } from '$lib/db/index';

/**
 * Address <-> coordinate lookup via OpenStreetMap's Nominatim.
 *
 * Why this shape:
 *
 *  * It runs on the server only. If the browser called Nominatim directly, every
 *    visitor's IP would reach a third party, which the privacy policy says does not
 *    happen. The Worker makes the call; the visitor talks only to Hallify.
 *
 *  * Every result is cached in `geocode_cache`, including misses. Nominatim's usage
 *    policy caps callers at roughly one request a second and asks that results be
 *    stored rather than re-fetched, so an address that has been looked up once never
 *    costs a second request -- and a bad address is not retried on every save.
 *
 *  * Results are biased to SK/CZ, the market the venues are in. "Hlavna 1" is
 *    otherwise ambiguous across most of Europe.
 *
 * Nominatim is free and run on donated infrastructure. Treat a failure as "no
 * coordinates", never as an error worth failing a save over: an operator can always
 * drop the pin by hand, and losing their edit because a free service was slow would
 * be a much worse outcome than an un-pinned venue.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org';

// Nominatim requires a identifying User-Agent and blocks callers that omit one.
const USER_AGENT = 'Hallify/1.0 (venue discovery; +https://hallify.sk)';

const TIMEOUT_MS = 4000;

export interface GeocodeResult {
	latitude: number;
	longitude: number;
	label: string | null;
}

/** Collapse whitespace and case so trivially different spellings share a cache row. */
function cacheKey(query: string): string {
	return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function validCoords(lat: unknown, lon: unknown): boolean {
	return (
		typeof lat === 'number' && typeof lon === 'number' &&
		Number.isFinite(lat) && Number.isFinite(lon) &&
		lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
	);
}

async function fetchJson(url: string): Promise<unknown | null> {
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
	try {
		const response = await fetch(url, {
			// Place names in Slovak ('Slovensko', not 'Slovakia'): without this header the
			// stored address read in English on the Slovak venue pages.
			headers: { 'User-Agent': USER_AGENT, accept: 'application/json', 'accept-language': 'sk,cs;q=0.8,en;q=0.5' },
			signal: abort.signal
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		// Timeout, abort, network failure or malformed JSON: all mean "no answer".
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Address -> coordinates. Returns null when nothing matched.
 *
 * A cached miss (a row with NULL coordinates) short-circuits to null without another
 * network call, so repeatedly saving a venue with an unrecognisable address stays cheap.
 */
export async function geocodeAddress(
	db: App.Locals['db'],
	address: string
): Promise<GeocodeResult | null> {
	const key = cacheKey(address);
	if (!key) return null;

	try {
		const cached = await dbFirst<{ latitude: number | null; longitude: number | null; label: string | null }>(
			db,
			'SELECT latitude, longitude, label FROM geocode_cache WHERE query = ?',
			key
		);
		if (cached) {
			return validCoords(cached.latitude, cached.longitude)
				? { latitude: cached.latitude as number, longitude: cached.longitude as number, label: cached.label }
				: null;
		}
	} catch {
		// Cache table missing (migration still rolling out) -- fall through to the lookup.
	}

	const url = `${ENDPOINT}/search?${new URLSearchParams({
		q: key,
		format: 'jsonv2',
		limit: '1',
		addressdetails: '0',
		countrycodes: 'sk,cz'
	})}`;

	const payload = await fetchJson(url);
	const hit = Array.isArray(payload) ? payload[0] : null;
	const lat = hit && typeof hit.lat === 'string' ? Number.parseFloat(hit.lat) : NaN;
	const lon = hit && typeof hit.lon === 'string' ? Number.parseFloat(hit.lon) : NaN;
	const found = validCoords(lat, lon)
		? { latitude: lat, longitude: lon, label: typeof hit.display_name === 'string' ? hit.display_name : null }
		: null;

	// Record the miss too, so a bad address costs one request rather than one per save.
	await rememberQuietly(db, key, found);
	return found;
}

/** Coordinates -> a human-readable address. Returns null when nothing matched. */
export async function reverseGeocode(
	db: App.Locals['db'],
	latitude: number,
	longitude: number
): Promise<string | null> {
	if (!validCoords(latitude, longitude)) return null;
	// Five decimal places is about a metre -- far finer than a venue needs, and it keeps
	// near-identical pin drags on one cache row.
	const key = `@${latitude.toFixed(5)},${longitude.toFixed(5)}`;

	try {
		const cached = await dbFirst<{ label: string | null }>(
			db,
			'SELECT label FROM geocode_cache WHERE query = ?',
			key
		);
		if (cached) return cached.label;
	} catch {
		/* cache unavailable -- fall through */
	}

	const url = `${ENDPOINT}/reverse?${new URLSearchParams({
		lat: String(latitude),
		lon: String(longitude),
		format: 'jsonv2',
		zoom: '18'
	})}`;

	const payload = await fetchJson(url);
	const label =
		payload && typeof payload === 'object' && typeof (payload as { display_name?: unknown }).display_name === 'string'
			? (payload as { display_name: string }).display_name
			: null;

	await rememberQuietly(db, key, label ? { latitude, longitude, label } : null);
	return label;
}

/**
 * Cache writes must never break the caller. A geocode is an enhancement to someone's
 * save, so a failed INSERT costs us a repeat lookup later and nothing more.
 */
async function rememberQuietly(
	db: App.Locals['db'],
	key: string,
	result: GeocodeResult | null
): Promise<void> {
	try {
		await dbRun(
			db,
			'INSERT OR REPLACE INTO geocode_cache (query, latitude, longitude, label) VALUES (?, ?, ?, ?)',
			key,
			result?.latitude ?? null,
			result?.longitude ?? null,
			result?.label ?? null
		);
	} catch {
		/* cache unavailable */
	}
}
