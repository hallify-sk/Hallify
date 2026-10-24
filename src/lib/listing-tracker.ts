// The browser side of the listing counters: impressions of directory cards, hall
// pages opened, and clicks on a venue's website, phone or e-mail.
//
// Each is counted once per hall and kind per page view, queued, and sent in one small
// batch (POST /api/listing-events) a moment later or when the page is left. Every
// counted event also goes to the dataLayer for GA4 ($lib/analytics `listing`), which
// only leaves the browser with consent; the first-party counter needs none, since it
// sets no cookie and stores nothing about the visitor ($lib/server/listing-stats).

import { listing as ga } from '$lib/analytics';
import type { ClickType, ListingEventType, ListingRef } from '$lib/listings';

const ENDPOINT = '/api/listing-events';
/** Matches the server's MAX_BATCH. */
const BATCH = 50;
const FLUSH_AFTER_MS = 2000;

let queue: { hall_id: string; type: ListingEventType }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

// "Once per page view". The directory rewrites its query string on every filter
// change (replaceState), so a page view is a pathname, not a URL.
let seen = new Set<string>();
let seenPath = '';

function firstTime(key: string): boolean {
	const path = location.pathname;
	if (path !== seenPath) {
		seenPath = path;
		seen = new Set();
	}
	if (seen.has(key)) return false;
	seen.add(key);
	return true;
}

function send(events: typeof queue): void {
	const body = JSON.stringify({ events });
	try {
		// keepalive lets the request outlive the page, as a click to another site does.
		void fetch(ENDPOINT, {
			method: 'POST',
			keepalive: true,
			credentials: 'omit',
			headers: { 'content-type': 'application/json' },
			body
		}).catch(() => {});
	} catch {
		/* counting is best-effort */
	}
}

export function flushListingEvents(): void {
	if (timer) clearTimeout(timer);
	timer = null;
	while (queue.length) send(queue.splice(0, BATCH));
}

function enqueue(hallId: string, type: ListingEventType): void {
	queue.push({ hall_id: hallId, type });
	if (!listening) {
		listening = true;
		// Leaving, switching tabs or closing: send what is waiting.
		addEventListener('pagehide', flushListingEvents);
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') flushListingEvents();
		});
	}
	if (queue.length >= BATCH) flushListingEvents();
	else if (!timer) timer = setTimeout(flushListingEvents, FLUSH_AFTER_MS);
}

function countable(ref: ListingRef | null | undefined): ref is ListingRef {
	// Demo venues on the directory are made up on the page; they have no row to count.
	return typeof window !== 'undefined' && !!ref?.hall_id && !ref.hall_id.startsWith('demo');
}

/** A directory card was seen. */
export function trackListingImpression(ref: ListingRef): void {
	if (!countable(ref) || !firstTime(`impression:${ref.hall_id}`)) return;
	enqueue(ref.hall_id, 'impression');
	ga.impression(ref);
}

/** A hall's page (directory venue page or the venue site's hall page) was opened.
 *  GA4 already has view_item for this, so only the counter records it. */
export function trackListingView(ref: ListingRef): void {
	if (!countable(ref) || !firstTime(`detail_view:${ref.hall_id}`)) return;
	enqueue(ref.hall_id, 'detail_view');
}

/** The venue's website, phone or e-mail was clicked. */
export function trackListingClick(ref: ListingRef, kind: ClickType): void {
	if (!countable(ref)) return;
	ga.click(ref, kind);
	if (!firstTime(`${kind}_click:${ref.hall_id}`)) return;
	enqueue(ref.hall_id, `${kind}_click`);
	// The click may take the visitor away (a website, a mail client): send it now.
	flushListingEvents();
}

/** How long a card must stay at least half visible to count as seen. */
export const IMPRESSION_MS = 1000;

/**
 * `use:listingImpression={ref}` on a card: counts it once it has been at least half
 * on screen for a second. A card scrolled past in a fling is not an impression.
 */
export function listingImpression(node: HTMLElement, ref: ListingRef | null) {
	let current = ref;
	let pending: ReturnType<typeof setTimeout> | null = null;
	if (typeof IntersectionObserver === 'undefined') return {};
	const cancel = () => {
		if (pending) clearTimeout(pending);
		pending = null;
	};
	const io = new IntersectionObserver(
		([entry]) => {
			if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
				if (!pending) pending = setTimeout(() => {
					pending = null;
					if (current) trackListingImpression(current);
					io.disconnect();
				}, IMPRESSION_MS);
			} else {
				cancel();
			}
		},
		{ threshold: [0, 0.5, 1] }
	);
	io.observe(node);
	return {
		update(next: ListingRef | null) {
			current = next;
		},
		destroy() {
			cancel();
			io.disconnect();
		}
	};
}
