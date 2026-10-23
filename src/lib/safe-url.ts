// Checks for URLs that people type in and that end up in an href, an <img src>, or a
// server-side fetch. A website field accepted javascript: (stored XSS on venue sites),
// and webhooks accepted internal addresses (SSRF). Use these at every such boundary.

/** True for http(s) URLs only (https only when `httpsOnly`). No credentials allowed. */
export function isHttpUrl(raw: unknown, { httpsOnly = false } = {}): boolean {
	try {
		const u = new URL(String(raw ?? '').trim());
		if (u.username || u.password) return false;
		return u.protocol === 'https:' || (!httpsOnly && u.protocol === 'http:');
	} catch {
		return false;
	}
}

/**
 * A website address as typed by a person ("www.reduta.sk", "https://reduta.sk/sala").
 * Returns a normalised http(s) URL, or null when it is not a usable public web address.
 */
export function normaliseWebsite(raw: unknown): string | null {
	const s = String(raw ?? '').trim();
	if (!s) return null;
	const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
	if (!isHttpUrl(withScheme)) return null;
	const u = new URL(withScheme);
	if (!u.hostname.includes('.') || !isPublicHostname(u.hostname)) return null;
	return u.toString();
}

/** An href that is safe to render: the URL when it is http(s), otherwise null. */
export function safeHref(raw: unknown): string | null {
	return isHttpUrl(raw) ? new URL(String(raw).trim()).toString() : null;
}

/** False for loopback, private, link-local and internal names, so the server never calls them. */
export function isPublicHostname(hostname: string): boolean {
	const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return false;
	const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
		if (a === 100 && b >= 64 && b <= 127) return false;
		if (a === 169 && b === 254) return false;
		if (a === 172 && b >= 16 && b <= 31) return false;
		if (a === 192 && b === 168) return false;
		return true;
	}
	if (h.includes(':')) {
		if (h === '::1' || h === '::' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('::ffff:')) return false;
		return true;
	}
	return h.includes('.');
}

/** A webhook endpoint: https, public host, no credentials. */
export function isSafeWebhookUrl(raw: unknown): boolean {
	if (!isHttpUrl(raw, { httpsOnly: true })) return false;
	return isPublicHostname(new URL(String(raw).trim()).hostname);
}
