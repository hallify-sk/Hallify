import { error } from '@sveltejs/kit';
import { imageVariantKey, isImageVariantWidth } from '$lib/image-variants';
import type { RequestHandler } from './$types';

/**
 * How long a browser may show an uploaded photo without asking again. Not a year
 * and immutable: a photo the venue removed (or of a deleted hall or a closed
 * organisation) is deleted from storage (B152), and a year-long cache kept showing
 * it. After a day the browser revalidates, which costs a 304 while the photo exists.
 */
const UPLOAD_CACHE_CONTROL = 'public, max-age=86400';

// Serves uploaded objects straight from the R2 binding. This works identically
// on localhost (local R2 emulation), production, and any SaaS custom hostname —
// no public bucket / r2.dev domain required. Objects are public by design
// (hall cover photos, gallery images shown to visitors).
export const GET: RequestHandler = async ({ params, platform, url, request }) => {
	const r2 = platform?.env?.R2;
	if (!r2) error(503, 'Image storage is not configured.');

	// Only the public upload prefix is servable — never arbitrary bucket keys, so
	// the route can't be turned into a reader for any future private objects that
	// might share this bucket. The upload endpoint writes everything under halls/.
	const key = params.key;
	if (!key || !key.startsWith('halls/')) error(404, 'Not found');

	// ?w=480: the smaller copy made at upload ($lib/image-variants), or the photo
	// itself when it has none. A copy outlives nothing: it goes with its photo.
	const w = Number(url.searchParams.get('w'));
	const keys = isImageVariantWidth(w) ? [imageVariantKey(key, w), key] : [key];

	const ifNoneMatch = request.headers.get('if-none-match');
	for (const candidate of keys) {
		// A browser revalidating its copy needs only the etag, not the bytes.
		if (ifNoneMatch) {
			const head = await r2.head(candidate);
			if (!head) continue;
			if (head.httpEtag === ifNoneMatch) {
				return new Response(null, { status: 304, headers: { 'cache-control': UPLOAD_CACHE_CONTROL, etag: head.httpEtag } });
			}
		}
		const obj = await r2.get(candidate);
		if (!obj || !obj.body) continue;
		// (Cast bridges the Workers-types vs DOM stream/BodyInit type mismatch; this
		// runs in the Worker runtime where R2's ReadableStream is a valid body.)
		return new Response(obj.body as unknown as BodyInit, {
			headers: {
				'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
				'cache-control': UPLOAD_CACHE_CONTROL,
				etag: obj.httpEtag,
			},
		});
	}
	error(404, 'Not found');
};
