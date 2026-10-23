// Request-level rules applied in hooks.server.ts before any route runs: the canonical
// scheme and host, and the Origin check on state-changing API calls. Kept pure so
// they can be tested without a Worker.

/** Hosts that must never be redirected to https or to another host: local
 *  development, preview deployments and raw IP addresses. */
export function isDevHost(host: string): boolean {
	const h = host.toLowerCase();
	return (
		h === '' ||
		h === 'localhost' ||
		h.endsWith('.localhost') ||
		h.endsWith('.local') ||
		h === '127.0.0.1' ||
		h === '[::1]' ||
		h === '::1' ||
		/^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
		h.startsWith('[') ||
		h.endsWith('.workers.dev') ||
		h.endsWith('.pages.dev')
	);
}

/** The scheme the visitor actually used. Cloudflare terminates TLS in front of the
 *  Worker and reports the original scheme in CF-Visitor (and X-Forwarded-Proto);
 *  the request URL is the fallback. */
export function visitorScheme(headers: Headers, url: URL): 'http' | 'https' {
	const visitor = headers.get('cf-visitor');
	if (visitor) {
		try {
			const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme;
			if (scheme === 'http' || scheme === 'https') return scheme;
		} catch { /* malformed header: fall through */ }
	}
	const forwarded = headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
	if (forwarded === 'http' || forwarded === 'https') return forwarded;
	return url.protocol === 'http:' ? 'http' : 'https';
}

/**
 * Where a request should be sent instead, or null to serve it here.
 *
 *  - http → https on every production host (the apex, venue subdomains and custom
 *    domains), so a login form can never be posted in clear text;
 *  - www.<apex> → <apex>, so the marketing site has one address and one canonical.
 *
 * Development and preview hosts are never redirected.
 */
export function canonicalRedirect(url: URL, headers: Headers, appDomain: string): string | null {
	const host = (headers.get('host') ?? url.host).split(':')[0].toLowerCase();
	if (isDevHost(host)) return null;
	const www = `www.${appDomain.toLowerCase()}`;
	const targetHost = host === www ? appDomain.toLowerCase() : host;
	const insecure = visitorScheme(headers, url) === 'http';
	if (!insecure && targetHost === host) return null;
	return `https://${targetHost}${url.pathname}${url.search}`;
}

/** 301 for reads; 308 keeps the method and body of a POST. */
export function redirectStatus(method: string): 301 | 308 {
	return method === 'GET' || method === 'HEAD' ? 301 : 308;
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** JSON endpoints that a browser calls with fetch. Form posts are already covered by
 *  SvelteKit's own CSRF check (it only looks at form content types). */
const ORIGIN_CHECKED_PREFIXES = ['/api/', '/app/manage/assistant/'];

/** Called by servers, not browsers, and authenticated by a signature or a secret. */
const ORIGIN_EXEMPT_PREFIXES = ['/api/stripe/webhook', '/api/cron/'];

export function needsOriginCheck(method: string, pathname: string): boolean {
	if (!STATE_CHANGING.has(method.toUpperCase())) return false;
	if (ORIGIN_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return false;
	return ORIGIN_CHECKED_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * True when a state-changing request may proceed. Browsers send Origin on every
 * non-GET request, so a cross-site one always carries a foreign Origin (or the
 * opaque "null"). A request with neither Origin nor Sec-Fetch-Site is not from a
 * browser and so cannot be a forged cross-site request; it is let through and
 * the route's own authentication decides.
 */
export function originAllowed(headers: Headers, url: URL): boolean {
	const origin = headers.get('origin');
	if (origin) {
		if (origin === 'null') return false;
		try {
			const o = new URL(origin);
			const host = (headers.get('host') ?? url.host).toLowerCase();
			return o.host.toLowerCase() === host || o.origin === url.origin;
		} catch {
			return false;
		}
	}
	const site = headers.get('sec-fetch-site');
	return !site || site === 'same-origin' || site === 'none';
}
