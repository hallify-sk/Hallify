import { json } from '@sveltejs/kit';
import { geocodeAddress, reverseGeocode } from '$lib/server/geocode';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import type { RequestHandler } from './$types';

/**
 * Address <-> coordinate lookup, proxied so the browser never talks to Nominatim
 * directly (which would hand a third party every visitor's IP).
 *
 * Open to anonymous visitors because the public venue search uses it to turn a typed
 * city into a map centre, so it is rate-limited per IP: without that it is a free
 * geocoding proxy for anyone who finds it.
 */
export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {
	const limit = await rateLimit(locals.db, rateLimitKey('geocode', getClientAddress()), RATE_LIMITS.geocode);
	if (!limit.ok) return json({ error: 'rate_limited' }, { status: 429 });

	const query = url.searchParams.get('q')?.trim();
	const lat = url.searchParams.get('lat');
	const lon = url.searchParams.get('lon');

	if (lat !== null && lon !== null) {
		const label = await reverseGeocode(locals.db, Number(lat), Number(lon));
		return json({ label });
	}

	if (!query) return json({ error: 'missing_query' }, { status: 400 });
	// A long string cannot be a real address and should not reach the upstream service.
	if (query.length > 200) return json({ error: 'query_too_long' }, { status: 400 });

	const result = await geocodeAddress(locals.db, query);
	return json({ result });
};
