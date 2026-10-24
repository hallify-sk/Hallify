/**
 * Reading public web pages on the assistant's behalf: a venue's own site, for its
 * text, prices and photos.
 *
 * The URL comes from the model, so it is treated as hostile. Only http(s) on the
 * standard ports, never a private, loopback or link-local address, redirects
 * followed by hand and re-checked at every hop, a hard time limit and a hard size
 * limit. (On Workers the network cannot reach a private range anyway; this is what
 * keeps local development and any other runtime just as safe.)
 */

const PRIVATE_V4 = [
	/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
];

export function isPublicHttpUrl(raw: string): URL | null {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
	if (u.username || u.password) return null;
	if (u.port && u.port !== '80' && u.port !== '443') return null;
	const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some((re) => re.test(host))) return null;
	if (host.includes(':')) {
		// IPv6 literal: loopback, unique-local and link-local are private.
		if (host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')) return null;
	}
	if (!host.includes('.') && !host.includes(':')) return null;
	return u;
}

export type Fetched =
	| { ok: true; url: string; contentType: string; body: ArrayBuffer }
	| { ok: false; reason: string };

/** Why a fetch failed, in words the assistant can act on — "try another source"
 *  rather than retrying a site that is refusing it. */
function statusReason(status: number): string {
	if (status === 429) return 'the site refused: too many requests (it limits automated visitors) — use another source';
	if (status === 401 || status === 403) return `the site refused access (HTTP ${status}) — use another source`;
	if (status === 404 || status === 410) return 'no such page (HTTP 404)';
	return `the site answered HTTP ${status}`;
}

export async function fetchPublic(
	raw: string,
	opts: { maxBytes: number; timeoutMs: number; accept: string; httpsOnly?: boolean }
): Promise<Fetched> {
	// With httpsOnly, every hop must be https: a redirect to plain http is refused.
	const allowed = (u: URL | null) => (u && (!opts.httpsOnly || u.protocol === 'https:') ? u : null);
	let url: URL | null = allowed(isPublicHttpUrl(raw));
	if (!url) return { ok: false, reason: 'not a public http(s) address' };
	const deadline = AbortSignal.timeout(opts.timeoutMs);
	for (let hop = 0; url && hop < 4; hop++) {
		const res: Response = await fetch(url, {
			redirect: 'manual',
			signal: deadline,
			headers: { accept: opts.accept, 'user-agent': 'HallifyAssistant/1.0 (+https://hallify.sk)' }
		});
		if (res.status >= 300 && res.status < 400) {
			const next: string | null = res.headers.get('location');
			url = next ? allowed(isPublicHttpUrl(new URL(next, url).toString())) : null;
			if (!url) return { ok: false, reason: 'it redirects somewhere that is not a public address' };
			continue;
		}
		if (!res.ok || !res.body) return { ok: false, reason: statusReason(res.status) };
		const declared = Number(res.headers.get('content-length') ?? 0);
		if (declared > opts.maxBytes) return { ok: false, reason: 'too large' };

		// Read with a running cap: a server that lies about (or omits) its length
		// still cannot make us hold more than maxBytes.
		const reader = res.body.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > opts.maxBytes) {
				await reader.cancel();
				return { ok: false, reason: 'too large' };
			}
			chunks.push(value);
		}
		const body = new Uint8Array(size);
		let at = 0;
		for (const c of chunks) { body.set(c, at); at += c.byteLength; }
		return { ok: true, url: url.toString(), contentType: (res.headers.get('content-type') ?? '').toLowerCase(), body: body.buffer };
	}
	return { ok: false, reason: 'too many redirects' };
}

const decodeEntities = (s: string) =>
	s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const attr = (tag: string, name: string) =>
	new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined) ?? null;

/** Photos worth offering: real raster images, not icons, logos or tracking pixels. */
const SKIP_IMAGE = /logo|icon|favicon|sprite|avatar|pixel|spacer|blank|loader|badge|flag|arrow|button|banner-ad|\.svg|\.gif|\.ico/i;

export interface PageImage { url: string; alt: string }
/** Something embedded on the page that may hold more photos than the page itself. */
export interface PageEmbed { url: string; kind: 'virtual tour' | 'video' | 'map' | 'embed' }
export interface PageSummary { url: string; title: string; description: string; text: string; images: PageImage[]; embeds: PageEmbed[] }

const IMAGE_FILE = /\.(jpe?g|png|webp)(\?[^"'\s)]*)?$/i;
/** Analytics and ad frames are not content. */
const SKIP_EMBED = /googletagmanager|doubleclick|google-analytics|facebook\.com\/tr|hotjar|recaptcha/i;
function embedKind(u: string): PageEmbed['kind'] {
	if (/youtube|youtu\.be|vimeo/i.test(u)) return 'video';
	if (/maps\.google|google\.[a-z.]+\/maps|openstreetmap|mapy\.cz/i.test(u)) return 'map';
	if (/tour|360|panoram|matterport|kuula|virtual|chameleo/i.test(u)) return 'virtual tour';
	return 'embed';
}

export function summarizeHtml(html: string, pageUrl: string, maxText = 4000): PageSummary {
	// Relative links resolve against <base href> when the page declares one (TYPO3 and
	// many CMSs do); resolving against the page's own path builds addresses that 404.
	const declared = /<base\b[^>]*>/i.exec(html);
	let base = pageUrl;
	if (declared) {
		const href = attr(declared[0], 'href');
		try { if (href) base = new URL(decodeEntities(href), pageUrl).toString(); } catch { /* keep the page URL */ }
	}
	const meta = (prop: string) => {
		const m = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*>`, 'i').exec(html);
		return m ? decodeEntities(attr(m[0], 'content') ?? '').trim() : '';
	};
	const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/\s+/g, ' ').trim();

	const images: PageImage[] = [];
	const seen = new Set<string>();
	const add = (src: string | null, alt: string) => {
		if (!src || src.startsWith('data:')) return;
		let abs: string;
		try { abs = new URL(decodeEntities(src.trim()), base).toString(); } catch { return; }
		if (SKIP_IMAGE.test(abs) || seen.has(abs) || !isPublicHttpUrl(abs)) return;
		seen.add(abs);
		images.push({ url: abs, alt: alt.slice(0, 120) });
	};
	add(meta('og:image') || null, 'og:image');
	add(meta('twitter:image') || null, 'twitter:image');
	for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = m[0];
		const w = Number(attr(tag, 'width') ?? 0);
		const h = Number(attr(tag, 'height') ?? 0);
		if ((w && w < 200) || (h && h < 150)) continue;
		const srcset = attr(tag, 'srcset') ?? attr(tag, 'data-srcset');
		// The largest candidate from srcset, else the plain or lazy-loaded src.
		const fromSet = srcset?.split(',').map((s) => s.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
		add(fromSet ?? attr(tag, 'data-src') ?? attr(tag, 'src'), decodeEntities(attr(tag, 'alt') ?? ''));
		if (images.length >= 40) break;
	}
	// Photos many sites do not put in <img>: <picture> sources, CSS backgrounds (hero
	// blocks, sliders) and gallery links that open the full-size photo in a lightbox.
	for (const m of html.matchAll(/<source\b[^>]*>/gi)) {
		const set = attr(m[0], 'srcset') ?? attr(m[0], 'data-srcset');
		const best = set?.split(',').map((x) => x.trim().split(/\s+/)).sort((a, b) => parseInt(b[1] ?? '0') - parseInt(a[1] ?? '0'))[0]?.[0];
		if (best && IMAGE_FILE.test(best.split('#')[0])) add(best, '');
	}
	for (const m of html.matchAll(/background(?:-image)?\s*:[^;"']*url\(\s*(?:&quot;|["'])?([^"')&]+?)(?:&quot;|["'])?\s*\)/gi)) {
		if (IMAGE_FILE.test(m[1])) add(m[1], 'background');
	}
	for (const m of html.matchAll(/<a\b[^>]*>/gi)) {
		const href = attr(m[0], 'href') ?? attr(m[0], 'data-href') ?? attr(m[0], 'data-src');
		if (href && IMAGE_FILE.test(href)) add(href, decodeEntities(attr(m[0], 'title') ?? attr(m[0], 'data-caption') ?? 'gallery'));
		if (images.length >= 60) break;
	}

	const embeds: PageEmbed[] = [];
	for (const m of html.matchAll(/<iframe\b[^>]*>/gi)) {
		const src = attr(m[0], 'src') ?? attr(m[0], 'data-src');
		if (!src) continue;
		let abs: string;
		try { abs = new URL(decodeEntities(src.replace(/\\\//g, '/')), base).toString(); } catch { continue; }
		if (SKIP_EMBED.test(abs) || !isPublicHttpUrl(abs) || embeds.some((e) => e.url === abs)) continue;
		embeds.push({ url: abs, kind: embedKind(abs) });
		if (embeds.length >= 6) break;
	}

	const text = decodeEntities(
		html.replace(/<(script|style|noscript|svg|nav|footer)\b[\s\S]*?<\/\1>/gi, ' ')
			.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
			.replace(/<[^>]+>/g, ' ')
	).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, maxText);

	return { url: pageUrl, title, description: meta('og:description') || meta('description'), text, images: images.slice(0, 24), embeds };
}

export async function readPage(raw: string): Promise<PageSummary | { error: string }> {
	let page: Fetched;
	try {
		page = await fetchPublic(raw, { maxBytes: 2_000_000, timeoutMs: 8000, accept: 'text/html,application/xhtml+xml' });
	} catch {
		return { error: 'the site did not answer in time' };
	}
	if (!page.ok) return { error: page.reason };
	if (!page.contentType.includes('html')) return { error: `not a web page (${page.contentType || 'unknown type'})` };
	return summarizeHtml(new TextDecoder('utf-8').decode(page.body), page.url);
}

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** First bytes of each format, so a server cannot pass off anything else as a photo. */
function sniff(b: Uint8Array): string | null {
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
	if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
	return null;
}

/**
 * Copy a photo from the web into our own storage, exactly where an upload goes.
 * Hallify never hotlinks someone else's server: the venue's page must not break
 * because their site changed, and their visitors' browsers must not call a third
 * party. Returns the same-origin URL, or null if it is not a usable photo.
 */
export async function importImage(r2: R2Bucket, userId: string, raw: string): Promise<string | null> {
	const img = await fetchPublic(raw, { maxBytes: 8 * 1024 * 1024, timeoutMs: 10000, accept: 'image/jpeg,image/png,image/webp' });
	if (!img.ok) return null;
	const type = sniff(new Uint8Array(img.body.slice(0, 12)));
	if (!type || img.body.byteLength < 8 * 1024) return null; // not a photo, or a thumbnail-sized one
	const key = `halls/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${IMAGE_TYPES[type]}`;
	await r2.put(key, img.body, { httpMetadata: { contentType: type } });
	return `/uploads/${key}`;
}

type R2Bucket = { put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> };
