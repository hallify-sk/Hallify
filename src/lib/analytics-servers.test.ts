import { describe, expect, it } from 'vitest';
import { normaliseServerUrl, container, cspOrigins, extendCsp, loaderSrc, hasCustomLoader, GOOGLE_TAG_ORIGIN } from './analytics-servers';

describe('normaliseServerUrl', () => {
	it('keeps only the https origin of a real host', () => {
		expect(normaliseServerUrl('https://data.hallify.sk/')).toBe('https://data.hallify.sk');
		expect(normaliseServerUrl('data.hallify.sk')).toBe('https://data.hallify.sk');
		expect(normaliseServerUrl('https://SGTM.Example.com/gtm.js?id=GTM-X')).toBe('https://sgtm.example.com');
		expect(normaliseServerUrl('')).toBeNull();
	});
	it('refuses anything that is not a plain public https host', () => {
		for (const bad of ['http://data.hallify.sk', 'https://localhost', 'https://10.0.0.1', 'https://[::1]', 'https://a.b:8443',
			'https://user:pw@data.hallify.sk', 'javascript:alert(1)', 'https://intranet', 'https://printer.local', 'https://exa mple.com'])
			expect(normaliseServerUrl(bad), bad).toBeNull();
	});
});

describe('custom loaders', () => {
	it('keeps the full URL of a server container\'s own loader', () => {
		expect(normaliseServerUrl('https://media.hallify.sk/l/okfl3x10.js')).toBe('https://media.hallify.sk/l/okfl3x10.js');
		expect(normaliseServerUrl('media.hallify.sk/l/okfl3x10.js')).toBe('https://media.hallify.sk/l/okfl3x10.js');
		expect(normaliseServerUrl('https://load.data.venue.sk/abc.js?st=Xy9-2_a%3D')).toBe('https://load.data.venue.sk/abc.js?st=Xy9-2_a%3D');
		expect(hasCustomLoader('https://media.hallify.sk/l/okfl3x10.js')).toBe(true);
		expect(hasCustomLoader('https://media.hallify.sk')).toBe(false);
	});
	it('treats Google\'s own loader path as the origin', () => {
		expect(normaliseServerUrl('https://data.hallify.sk/gtm.js')).toBe('https://data.hallify.sk');
	});
	it('refuses paths and queries that could break out of the attribute or the CSP', () => {
		// The URL parser percent-encodes quotes and spaces in a query, which is safe.
		expect(normaliseServerUrl('https://a.sk/l/x.js?a="b c"')).toBe('https://a.sk/l/x.js?a=%22b%20c%22');
		for (const bad of ['https://a.sk/l/<x>.js', 'https://a.sk/l/x.js?a=b;c', "https://a.sk/l/x'.js"])
			expect(normaliseServerUrl(bad), bad).toBeNull();
	});
	it('loads the custom loader instead of /gtm.js, with or without a container id', () => {
		const c = container('', 'https://media.hallify.sk/l/okfl3x10.js', 'platform')!;
		expect(c).toEqual({ id: '', origin: 'https://media.hallify.sk', loader: 'https://media.hallify.sk/l/okfl3x10.js', owner: 'platform' });
		expect(loaderSrc(c)).toBe('https://media.hallify.sk/l/okfl3x10.js');
		expect(cspOrigins([c])).toEqual(['https://media.hallify.sk']);
		expect(loaderSrc(container('GTM-ABC1234', 'https://media.hallify.sk/l/okfl3x10.js', 'venue')!)).toBe('https://media.hallify.sk/l/okfl3x10.js');
		expect(loaderSrc(container('GTM-ABC1234', 'https://data.venue.sk', 'venue')!)).toBe('https://data.venue.sk/gtm.js?id=GTM-ABC1234');
	});
	it('still needs a container id without a custom loader', () => {
		expect(container('', 'https://data.venue.sk', 'venue')).toBeNull();
		expect(container('', '', 'venue')).toBeNull();
	});
});

describe('container', () => {
	it('loads from Google without a server container, from the server container with one', () => {
		expect(container('gtm-abc1234', '', 'platform')).toEqual({ id: 'GTM-ABC1234', origin: GOOGLE_TAG_ORIGIN, owner: 'platform' });
		expect(container('GTM-ABC1234', 'https://data.venue.sk', 'venue')?.origin).toBe('https://data.venue.sk');
		expect(container('UA-123', '', 'venue')).toBeNull();
	});
});

describe('CSP', () => {
	const csp = "default-src 'self'; script-src 'self' https://www.googletagmanager.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'";
	it('allows each server container origin for scripts, beacons and pixels, once', () => {
		const origins = cspOrigins([
			container('GTM-AAAA111', 'https://data.hallify.sk', 'platform')!,
			container('GTM-BBBB222', '', 'venue')!,
			container('GTM-CCCC333', 'https://data.hallify.sk', 'venue')!,
		]);
		expect(origins).toEqual(['https://data.hallify.sk']);
		const out = extendCsp(csp, origins);
		expect(out).toContain("script-src 'self' https://www.googletagmanager.com https://data.hallify.sk");
		expect(out).toContain("img-src 'self' data: https://data.hallify.sk");
		expect(out).toContain("connect-src 'self' https://data.hallify.sk");
		expect(out).toContain("frame-ancestors 'none'");
		expect(out).not.toContain('default-src \'self\' https://data');
	});
	it('leaves the policy alone when there is nothing to add', () => {
		expect(extendCsp(csp, [])).toBe(csp);
	});
});
