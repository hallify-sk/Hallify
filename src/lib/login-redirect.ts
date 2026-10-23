/** Sign-in URLs that remember where the person was going.
 *
 *  A guard that sends a signed-out visitor to a bare `/app/login` loses the deep link:
 *  someone opening /app/manage/reservations from an email lands on /app after signing
 *  in. Every guard builds its login URL here instead, so the page they asked for comes
 *  back as `?redirect=` (the login forms only follow same-origin paths). */

/** The path (with its query) to return to after sign-in. Form-action keys (`?/save`)
 *  are dropped: the visitor returns to the page, never to a POST endpoint. */
export function returnPath(url: URL): string {
	const params = new URLSearchParams();
	for (const [key, value] of url.searchParams) {
		if (!key.startsWith('/')) params.append(key, value);
	}
	const query = params.toString();
	return url.pathname + (query ? `?${query}` : '');
}

/** The sign-in page for `url`, carrying it as `?redirect=`. The console home is where
 *  /app/login goes by default, so it needs no parameter. */
export function loginUrl(url: URL, base: '/app/login' | '/login' = '/app/login'): string {
	const next = returnPath(url);
	if (base === '/app/login' && (next === '/app' || next === '/app/')) return base;
	return `${base}?redirect=${encodeURIComponent(next)}`;
}
