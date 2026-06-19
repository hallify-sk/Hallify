import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Serves uploaded objects straight from the R2 binding. This works identically
// on localhost (local R2 emulation), production, and any SaaS custom hostname —
// no public bucket / r2.dev domain required. Objects are public by design
// (hall cover photos, gallery images shown to visitors).
export const GET: RequestHandler = async ({ params, platform }) => {
	const r2 = platform?.env?.R2;
	if (!r2) error(503, 'Image storage is not configured.');

	// Only the public upload prefix is servable — never arbitrary bucket keys, so
	// the route can't be turned into a reader for any future private objects that
	// might share this bucket. The upload endpoint writes everything under halls/.
	const key = params.key;
	if (!key || !key.startsWith('halls/')) error(404, 'Not found');

	const obj = await r2.get(key);
	if (!obj || !obj.body) error(404, 'Not found');

	// Keys are unique per upload, so the bytes never change → cache hard.
	// (Cast bridges the Workers-types vs DOM stream/BodyInit type mismatch; this
	// runs in the Worker runtime where R2's ReadableStream is a valid body.)
	return new Response(obj.body as unknown as BodyInit, {
		headers: {
			'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
			'cache-control': 'public, max-age=31536000, immutable',
			etag: obj.httpEtag,
		},
	});
};
