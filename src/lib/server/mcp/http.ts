// Request-level rules for the MCP endpoint and its OAuth server: which host serves
// them, which origin they are bound to, which browser origins may call them, and the
// form-CSRF rule they are exempt from. Pure, so hooks and tests share them.

/** Everything the MCP feature serves. Apex only: a venue's subdomain or custom
 *  domain must never mint tokens for the platform or answer as its resource. */
export function isMcpPath(pathname: string): boolean {
	return (
		pathname === '/mcp' ||
		pathname.startsWith('/mcp/') ||
		pathname === '/oauth' ||
		pathname.startsWith('/oauth/') ||
		pathname.startsWith('/.well-known/oauth-protected-resource') ||
		pathname.startsWith('/.well-known/oauth-authorization-server')
	);
}

/** The platform's own host: the apex in production, or a local / preview host in
 *  development. Venue subdomains (`slug.hallify.sk`, `slug.localhost`) and custom
 *  domains are not. */
export function isApexHost(host: string, appDomain: string): boolean {
	const h = host.toLowerCase().split(':')[0];
	if (h === appDomain.toLowerCase()) return true;
	if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
	return h.endsWith('.workers.dev') || h.endsWith('.pages.dev');
}

/** The origin tokens are bound to and metadata names. In production that is
 *  https://<APP_URL host>; anywhere else (local dev, previews) the request's own
 *  origin, so a local client can complete the flow against a local server. */
export function mcpOrigin(url: URL, appUrl: string | undefined): string {
	try {
		if (appUrl) {
			const app = new URL(appUrl);
			if (app.host.toLowerCase() === url.host.toLowerCase()) return `https://${app.host}`;
		}
	} catch {
		/* malformed APP_URL: fall back to the request */
	}
	return url.origin;
}

export const mcpResource = (origin: string) => `${origin}/mcp`;

/** The address people give their agent: always the platform's own, also when the
 *  page showing it is opened on a venue's domain. */
export function publicMcpUrl(url: URL, appDomain: string, appUrl: string | undefined): string {
	return isApexHost(url.host, appDomain) ? mcpResource(mcpOrigin(url, appUrl)) : `https://${appDomain}/mcp`;
}
export const protectedResourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/mcp`;

/** Browser origins that may call /mcp directly. Agents normally call from their own
 *  servers (no Origin header at all); a browser-based one must be listed. Loopback
 *  origins are allowed for local inspectors. Extra ones: MCP_ALLOWED_ORIGINS. */
const DEFAULT_ALLOWED_ORIGINS = ['https://claude.ai', 'https://chatgpt.com', 'https://chat.openai.com'];

export function mcpOriginAllowed(origin: string | null, ownOrigin: string, extra = ''): boolean {
	if (!origin) return true;
	if (origin === 'null') return false;
	if (origin === ownOrigin) return true;
	const listed = [...DEFAULT_ALLOWED_ORIGINS, ...extra.split(',').map((s) => s.trim()).filter(Boolean)];
	if (listed.includes(origin)) return true;
	try {
		const u = new URL(origin);
		return u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]');
	} catch {
		return false;
	}
}

/** CORS for the endpoints agents call with a bearer token or no credentials at all.
 *  No cookies are ever accepted on them, so echoing an allowed origin is safe. */
export function corsHeaders(origin: string | null, allow: 'any' | 'echo' = 'any'): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': allow === 'echo' && origin ? origin : '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
		'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin'
	};
}

// ── Form CSRF ───────────────────────────────────────────────────────────────

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/x-sveltekit-formdata'];
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** OAuth endpoints that agents' servers POST form bodies to without an Origin:
 *  they authenticate by code + PKCE, refresh token or client secret, never by a
 *  cookie, so a cross-site form cannot do anything with them. */
const FORM_CSRF_EXEMPT = ['/oauth/token', '/oauth/revoke', '/oauth/register'];

/**
 * SvelteKit's own form-CSRF rule (kit.csrf), applied here instead so the OAuth
 * endpoints above can be exempted from it: a state-changing request with a form
 * content type must come from this origin. svelte.config.js turns the built-in
 * check off (`trustedOrigins: ['*']`); this is its replacement, for every other path.
 */
export function formCsrfRefused(method: string, pathname: string, headers: Headers, url: URL): boolean {
	if (!WRITES.has(method.toUpperCase())) return false;
	const type = (headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	if (!FORM_TYPES.includes(type)) return false;
	if (FORM_CSRF_EXEMPT.includes(pathname)) return false;
	return headers.get('origin') !== url.origin;
}
