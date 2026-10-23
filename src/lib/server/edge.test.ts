import { describe, expect, it } from 'vitest';
import { canonicalRedirect, isDevHost, needsOriginCheck, originAllowed, redirectStatus, visitorScheme } from './edge';

const h = (o: Record<string, string>) => new Headers(o);

describe('canonicalRedirect', () => {
	it('sends http on the apex to https, keeping path and query', () => {
		const url = new URL('http://hallify.sk/app/login?next=%2Fapp');
		expect(canonicalRedirect(url, h({ host: 'hallify.sk' }), 'hallify.sk')).toBe('https://hallify.sk/app/login?next=%2Fapp');
	});

	it('trusts CF-Visitor over the request URL', () => {
		const url = new URL('https://kastiel.hallify.sk/halls');
		expect(canonicalRedirect(url, h({ host: 'kastiel.hallify.sk', 'cf-visitor': '{"scheme":"http"}' }), 'hallify.sk'))
			.toBe('https://kastiel.hallify.sk/halls');
		expect(canonicalRedirect(new URL('http://kastiel.hallify.sk/halls'), h({ host: 'kastiel.hallify.sk', 'cf-visitor': '{"scheme":"https"}' }), 'hallify.sk'))
			.toBeNull();
	});

	it('uses X-Forwarded-Proto when there is no CF-Visitor', () => {
		const url = new URL('https://hallify.sk/');
		expect(canonicalRedirect(url, h({ host: 'hallify.sk', 'x-forwarded-proto': 'http' }), 'hallify.sk')).toBe('https://hallify.sk/');
	});

	it('folds www into the apex, over https too', () => {
		const url = new URL('https://www.hallify.sk/priestory?x=1');
		expect(canonicalRedirect(url, h({ host: 'www.hallify.sk' }), 'hallify.sk')).toBe('https://hallify.sk/priestory?x=1');
	});

	it('leaves https production requests alone', () => {
		expect(canonicalRedirect(new URL('https://hallify.sk/'), h({ host: 'hallify.sk' }), 'hallify.sk')).toBeNull();
		expect(canonicalRedirect(new URL('https://sala.example.sk/'), h({ host: 'sala.example.sk' }), 'hallify.sk')).toBeNull();
	});

	it('redirects custom domains to https as well', () => {
		expect(canonicalRedirect(new URL('http://sala.example.sk/'), h({ host: 'sala.example.sk' }), 'hallify.sk')).toBe('https://sala.example.sk/');
	});

	it('never touches local or preview hosts', () => {
		for (const host of ['localhost:5173', '127.0.0.1:8787', 'kastiel.localhost:5173', 'hallify.example.workers.dev', '10.0.0.4']) {
			const url = new URL(`http://${host}/app/login`);
			expect(canonicalRedirect(url, h({ host }), 'hallify.sk')).toBeNull();
		}
	});
});

describe('helpers', () => {
	it('classifies dev hosts', () => {
		expect(isDevHost('localhost')).toBe(true);
		expect(isDevHost('a.localhost')).toBe(true);
		expect(isDevHost('hallify.sk')).toBe(false);
	});

	it('keeps the method of a redirected POST', () => {
		expect(redirectStatus('GET')).toBe(301);
		expect(redirectStatus('POST')).toBe(308);
	});

	it('reads the visitor scheme', () => {
		expect(visitorScheme(h({ 'cf-visitor': 'not json' }), new URL('http://x.sk/'))).toBe('http');
	});
});

describe('origin check on API writes', () => {
	it('applies to state-changing API calls only', () => {
		expect(needsOriginCheck('POST', '/api/holds')).toBe(true);
		expect(needsOriginCheck('DELETE', '/api/holds')).toBe(true);
		expect(needsOriginCheck('POST', '/app/manage/assistant/chat')).toBe(true);
		expect(needsOriginCheck('GET', '/api/holds')).toBe(false);
		expect(needsOriginCheck('POST', '/api/stripe/webhook')).toBe(false);
		expect(needsOriginCheck('POST', '/api/cron/cleanup')).toBe(false);
		expect(needsOriginCheck('POST', '/app/manage/halls')).toBe(false);
	});

	it('accepts same-origin and refuses foreign or opaque origins', () => {
		const url = new URL('https://hallify.sk/api/holds');
		expect(originAllowed(h({ host: 'hallify.sk', origin: 'https://hallify.sk' }), url)).toBe(true);
		expect(originAllowed(h({ host: 'hallify.sk', origin: 'https://evil.example' }), url)).toBe(false);
		expect(originAllowed(h({ host: 'hallify.sk', origin: 'https://kastiel.hallify.sk' }), url)).toBe(false);
		expect(originAllowed(h({ host: 'hallify.sk', origin: 'null' }), url)).toBe(false);
	});

	it('lets non-browser clients through and refuses a cross-site fetch without Origin', () => {
		const url = new URL('https://hallify.sk/api/holds');
		expect(originAllowed(h({ host: 'hallify.sk' }), url)).toBe(true);
		expect(originAllowed(h({ host: 'hallify.sk', 'sec-fetch-site': 'cross-site' }), url)).toBe(false);
	});
});
