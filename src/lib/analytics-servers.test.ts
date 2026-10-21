import { describe, expect, it } from 'vitest';
import { normaliseServerUrl, container, cspOrigins, extendCsp, GOOGLE_TAG_ORIGIN } from './analytics-servers';

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
