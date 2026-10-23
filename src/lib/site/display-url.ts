import { safeHref } from '$lib/safe-url';

/**
 * A website as a short, readable label: 'reduta.sk/sala' rather than the full
 * 'https://www.reduta.sk/sala?utm_source=…'. Printing the raw URL let a long one
 * push the venue site wider than the screen.
 *
 * Returns null when the address is not a safe http(s) URL (it is then not shown).
 */
export function displayWebsite(raw: unknown, max = 40): { href: string; label: string } | null {
	const href = safeHref(raw);
	if (!href) return null;
	const u = new URL(href);
	const host = u.hostname.replace(/^www\./, '');
	const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
	let label = host + path;
	if (label.length > max) label = label.slice(0, max - 1) + '…';
	return { href, label };
}
