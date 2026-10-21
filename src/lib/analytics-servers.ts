/**
 * Server-side Google Tag Manager (sGTM).
 *
 * A server container runs on a first-party domain (for example
 * https://data.hallify.sk). The browser then loads `gtm.js` from there instead of
 * googletagmanager.com, and the GA4/Ads tags send their hits to it, so the requests
 * stay first-party and the server container decides what is forwarded to Google.
 *
 * Both the platform and each organisation can have one. What is stored is only the
 * ORIGIN: the path of the loader is fixed (`/gtm.js`), and keeping it to an origin is
 * what lets the Content-Security-Policy allow exactly that host and nothing more.
 */

/** A web container id, e.g. GTM-ABC1234. */
export const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,}$/;

/** Google's own loader, used when no server container is set. */
export const GOOGLE_TAG_ORIGIN = 'https://www.googletagmanager.com';

/**
 * Normalise a server-container URL to its origin, or null when it is not one we
 * accept: https only, a real host name (no IP literals, no localhost), no
 * credentials, no port other than the default. A path or query is dropped, since
 * the loader path is always /gtm.js.
 */
export function normaliseServerUrl(raw: string | null | undefined): string | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	let u: URL;
	try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
	if (u.protocol !== 'https:') return null;
	if (u.username || u.password || u.port) return null;
	const host = u.hostname.toLowerCase();
	if (!host.includes('.') || host.endsWith('.local') || host === 'localhost') return null;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) return null;
	if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) return null;
	return `https://${host}`;
}

/** One container to load on a page. */
export interface AnalyticsContainer {
	/** The web container id (GTM-…). */
	id: string;
	/** Where gtm.js is loaded from: a server container's origin, or Google's. */
	origin: string;
	/** Hallify's own container, or the venue's. */
	owner: 'platform' | 'venue';
}

export function container(id: string, serverUrl: string | null | undefined, owner: AnalyticsContainer['owner']): AnalyticsContainer | null {
	const clean = String(id ?? '').trim().toUpperCase();
	if (!GTM_ID_PATTERN.test(clean)) return null;
	return { id: clean, origin: normaliseServerUrl(serverUrl) ?? GOOGLE_TAG_ORIGIN, owner };
}

/** The extra origins a page's CSP has to allow for its containers. */
export function cspOrigins(containers: AnalyticsContainer[]): string[] {
	return [...new Set(containers.map((c) => c.origin).filter((o) => o !== GOOGLE_TAG_ORIGIN))];
}

/** Add origins to script-src, connect-src and img-src of a CSP header value. */
export function extendCsp(csp: string, origins: string[]): string {
	if (!origins.length) return csp;
	const add = origins.join(' ');
	return csp.replace(/(^|;\s*)(script-src|connect-src|img-src)([^;]*)/gi, (_m, sep, name, rest) => `${sep}${name}${rest} ${add}`);
}
