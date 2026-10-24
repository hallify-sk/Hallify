/**
 * Server-side Google Tag Manager (sGTM).
 *
 * A server container runs on a first-party domain (for example
 * https://data.hallify.sk). The browser then loads `gtm.js` from there instead of
 * googletagmanager.com, and the GA4/Ads tags send their hits to it, so the requests
 * stay first-party and the server container decides what is forwarded to Google.
 *
 * Both the platform and each organisation can have one. What is stored is the ORIGIN,
 * or the full URL of a custom loader: server containers can serve the web container
 * under a path of their own (Stape's "custom loader", e.g.
 * https://media.hallify.sk/l/okfl3x10.js), which ad blockers don't recognise. Such a
 * loader already names its container, so the GTM id is optional with one. Either
 * way the Content-Security-Policy allows exactly that origin and nothing more.
 */

/** A web container id, e.g. GTM-ABC1234. */
export const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,}$/;

/** Google's own loader, used when no server container is set. */
export const GOOGLE_TAG_ORIGIN = 'https://www.googletagmanager.com';

/** Paths and queries a custom loader may have: plain URL characters, nothing that
 *  could break out of the attribute or the CSP. */
const LOADER_PATH = /^\/[A-Za-z0-9._~\/-]{1,200}$/;
const LOADER_QUERY = /^[A-Za-z0-9._~=&%-]{0,300}$/;

/**
 * Normalise a server-container address, or null when it is not one we accept: https
 * only, a real host name (no IP literals, no localhost), no credentials, no port
 * other than the default. Returns the origin, or origin + path (+ query) when the
 * address is a custom loader. Google's own /gtm.js path counts as no path, so a
 * pasted `https://data.example.com/gtm.js?id=GTM-X` is the origin.
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
	const origin = `https://${host}`;
	const path = u.pathname;
	if (path === '/' || path === '' || /^\/gtm\.js$/i.test(path)) return origin;
	const query = u.search.replace(/^\?/, '');
	if (!LOADER_PATH.test(path) || path.includes('..') || !LOADER_QUERY.test(query)) return null;
	return `${origin}${path}${query ? `?${query}` : ''}`;
}

/** True when a normalised server address is a custom loader, not just an origin. */
export function hasCustomLoader(serverUrl: string): boolean {
	return serverUrl !== new URL(serverUrl).origin;
}

/** Where the browser loads a container from. */
export function loaderSrc(c: Pick<AnalyticsContainer, 'id' | 'origin' | 'loader'>): string {
	return c.loader ?? `${c.origin}/gtm.js?id=${encodeURIComponent(c.id)}`;
}

/** One container to load on a page. */
export interface AnalyticsContainer {
	/** The web container id (GTM-…), or '' when a custom loader names it. */
	id: string;
	/** Where gtm.js is loaded from: a server container's origin, or Google's. */
	origin: string;
	/** A custom loader's full URL on `origin`, loaded instead of /gtm.js?id=…. */
	loader?: string;
	/** Hallify's own container, or the venue's. */
	owner: 'platform' | 'venue';
}

export function container(id: string, serverUrl: string | null | undefined, owner: AnalyticsContainer['owner']): AnalyticsContainer | null {
	const clean = String(id ?? '').trim().toUpperCase();
	const server = normaliseServerUrl(serverUrl);
	const origin = server ? new URL(server).origin : GOOGLE_TAG_ORIGIN;
	const loader = server && server !== origin ? server : undefined;
	if (clean ? !GTM_ID_PATTERN.test(clean) : !loader) return null;
	return loader ? { id: clean, origin, loader, owner } : { id: clean, origin, owner };
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
