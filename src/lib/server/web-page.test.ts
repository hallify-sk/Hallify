import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl, summarizeHtml } from './web-page';

describe('isPublicHttpUrl', () => {
	it('allows ordinary public sites', () => {
		expect(isPublicHttpUrl('https://www.mkc.snv.sk/reduta')).not.toBeNull();
		expect(isPublicHttpUrl('http://93.184.216.34/')).not.toBeNull();
	});
	it('refuses anything that could reach inside', () => {
		for (const u of [
			'http://localhost:5173/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/',
			'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://[fd00::1]/', 'http://printer.local/',
			'http://intranet/', 'https://example.com:8443/', 'ftp://example.com/', 'file:///etc/passwd',
			'https://user:pass@example.com/', 'javascript:alert(1)'
		]) expect(isPublicHttpUrl(u), u).toBeNull();
	});
});

describe('summarizeHtml', () => {
	const html = `<html><head><title>Reduta &amp; Koncertná sieň</title>
		<meta name="description" content="Historická sála">
		<meta property="og:image" content="/img/sala.jpg"></head>
		<body><nav>Menu</nav><script>var x=1</script>
		<h1>Reduta</h1><p>Kapacita 350&nbsp;osôb.</p>
		<img src="/logo.png" alt="logo"><img src="/img/ikona.jpg" width="32" height="32">
		<img srcset="/img/a-480.jpg 480w, /img/a-1200.jpg 1200w" alt="Sála">
		<img data-src="https://cdn.example.com/b.webp" alt="Pódium"><img src="http://127.0.0.1/x.jpg"></body></html>`;
	const page = summarizeHtml(html, 'https://www.reduta.sk/o-nas');

	it('reads the title, description and visible text, not scripts or navigation', () => {
		expect(page.title).toBe('Reduta & Koncertná sieň');
		expect(page.description).toBe('Historická sála');
		expect(page.text).toContain('Kapacita 350 osôb.');
		expect(page.text).not.toContain('var x');
		expect(page.text).not.toContain('Menu');
	});
	it('collects real photos as absolute URLs: og:image, the largest srcset, lazy src — not logos, icons or private hosts', () => {
		expect(page.images.map((i) => i.url)).toEqual([
			'https://www.reduta.sk/img/sala.jpg',
			'https://www.reduta.sk/img/a-1200.jpg',
			'https://cdn.example.com/b.webp'
		]);
	});

	it('resolves relative photos against <base href>, as browsers do', () => {
		const p = summarizeHtml('<head><base href="https://visit.spisskanovaves.eu/"></head><img src="fileadmin/_processed_/reduta.jpg">',
			'https://visit.spisskanovaves.eu/sk/co-vidiet/pamiatky/reduta/');
		expect(p.images[0].url).toBe('https://visit.spisskanovaves.eu/fileadmin/_processed_/reduta.jpg');
	});
});

describe('summarizeHtml: photos outside <img>', () => {
	const html = `<html><head><base href="https://visit.example.sk/"><meta property="og:image" content="https://visit.example.sk/_processed_/csm_title.jpg"></head><body>
		<div class="media-object image" style="background-image: url('fileadmin/user_upload/title.jpg')"></div>
		<div style="background:#000 url(&quot;/img/hero.webp&quot;) center"></div>
		<picture><source srcset="/img/sala-800.webp 800w, /img/sala-1600.webp 1600w"><img src="/img/sala-800.jpg" alt="Sála"></picture>
		<a href="/gallery/1.jpg" class="lightbox" title="Balkón"><img src="/gallery/1-thumb.jpg" width="120" height="80"></a>
		<a href="/kontakt">Kontakt</a>
		<iframe src="https://tour.chameleo24.sk/snv/21.html"></iframe>
		<iframe src="https://www.youtube.com/embed/abc"></iframe>
		<iframe src="//www.googletagmanager.com/ns.html?id=GTM-X"></iframe>
	</body></html>`;
	const page = summarizeHtml(html, 'https://visit.example.sk/sk/reduta/');
	const urls = page.images.map((i) => i.url);
	it('finds CSS backgrounds, <picture> sources and lightbox links', () => {
		expect(urls).toContain('https://visit.example.sk/fileadmin/user_upload/title.jpg');
		expect(urls).toContain('https://visit.example.sk/img/hero.webp');
		expect(urls).toContain('https://visit.example.sk/img/sala-1600.webp');
		expect(urls).toContain('https://visit.example.sk/gallery/1.jpg');
		expect(urls).not.toContain('https://visit.example.sk/gallery/1-thumb.jpg');
	});
	it('reports embedded tours and videos, not analytics frames', () => {
		expect(page.embeds).toEqual([
			{ url: 'https://tour.chameleo24.sk/snv/21.html', kind: 'virtual tour' },
			{ url: 'https://www.youtube.com/embed/abc', kind: 'video' },
		]);
	});
});
