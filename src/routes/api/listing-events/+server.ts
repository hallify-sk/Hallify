import { json } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { isBotUserAgent, parseListingBatch, recordListingEvents } from '$lib/server/listing-stats';
import type { RequestHandler } from './$types';

/** Larger than any batch the page sends (MAX_BATCH short events). */
const MAX_BODY = 8 * 1024;

/** A one-way, truncated hash of the address: the rate limit needs a bucket per
 *  visitor, the counters need nothing about them, and no address is stored. */
async function addressBucket(address: string | null): Promise<string | null> {
	if (!address) return null;
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`listing-events:${address}`));
	return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Directory listing counters: impressions, page views and contact clicks, sent by the
 * directory and the hall pages in small batches (fetch keepalive, so a click that
 * leaves the page is still counted). Anonymous by design and cookie-free — see
 * $lib/server/listing-stats for why it needs no consent.
 *
 * Same-origin only: hooks.server.ts refuses a cross-site write to /api/ (and a
 * cross-site text/plain one as a form post), so another site cannot pump a venue's
 * figures from its visitors' browsers. Bots are dropped quietly — they get the same
 * 204 as everyone, so there is nothing to probe.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (isBotUserAgent(request.headers.get('user-agent'))) return new Response(null, { status: 204 });

	const text = await request.text();
	if (text.length > MAX_BODY) return json({ error: 'too_large' }, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}
	const counts = parseListingBatch(body);
	if (!counts) return json({ error: 'invalid_batch' }, { status: 400 });
	if (!counts.size) return new Response(null, { status: 204 });

	let address: string | null = null;
	try {
		address = getClientAddress();
	} catch {
		/* not behind Cloudflare (local dev): one shared bucket */
	}
	const limit = await rateLimit(locals.db, rateLimitKey('listing', await addressBucket(address)), RATE_LIMITS.listingEvents);
	if (!limit.ok) return json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(limit.retryAfter) } });

	try {
		await recordListingEvents(locals.db, counts);
	} catch (e) {
		// A counter must never break a page; the visitor does not wait on this anyway.
		console.error('listing-events:', e instanceof Error ? e.message : String(e));
	}
	return new Response(null, { status: 204 });
};
