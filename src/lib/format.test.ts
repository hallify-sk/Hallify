import { describe, expect, it } from 'vitest';
import { parseDbTime, formatMoney, plural, formatDate, timeAgo } from './format';
import { slugify } from './slug';
import { isHttpUrl, normaliseWebsite, safeHref, isPublicHostname, isSafeWebhookUrl } from './safe-url';
import { statusLabel, fmtDate } from './reservationStatus';

describe('parseDbTime', () => {
	it('reads SQLite datetime strings as UTC', () => {
		expect(parseDbTime('2026-10-23 08:50:00')?.toISOString()).toBe('2026-10-23T08:50:00.000Z');
		expect(parseDbTime('2026-10-23T08:50')?.toISOString()).toBe('2026-10-23T08:50:00.000Z');
	});
	it('keeps an explicit zone', () => {
		expect(parseDbTime('2026-10-23T10:50:00+02:00')?.toISOString()).toBe('2026-10-23T08:50:00.000Z');
		expect(parseDbTime('2026-10-23T08:50:00.000Z')?.toISOString()).toBe('2026-10-23T08:50:00.000Z');
	});
	it('returns null for nothing or garbage', () => {
		expect(parseDbTime(null)).toBeNull();
		expect(parseDbTime('')).toBeNull();
		expect(parseDbTime('not a date')).toBeNull();
	});
});

describe('formatting', () => {
	it('formats money per locale', () => {
		expect(formatMoney(1150, 'sk').replace(/\s/g, ' ')).toBe('11,50 €');
		expect(formatMoney(1150, 'en')).toBe('€11.50');
	});
	it('picks Slovak plural forms', () => {
		const f = { one: 'sála', few: 'sály', many: 'sál' };
		expect([1, 2, 4, 5, 0].map((n) => plural('sk', n, f))).toEqual(['sála', 'sály', 'sály', 'sál', 'sál']);
		expect(plural('en', 1, { one: 'hall', many: 'halls' })).toBe('hall');
		expect(plural('en', 3, { one: 'hall', many: 'halls' })).toBe('halls');
	});
	it('formats plain event dates without shifting the day', () => {
		expect(formatDate('2026-11-21', 'en')).toBe('21 Nov 2026');
	});
	it('says how long ago', () => {
		const now = Date.parse('2026-10-23T10:00:00Z');
		expect(timeAgo('2026-10-23 09:55:00', 'en', now)).toBe('5 minutes ago');
	});
});

describe('slugify', () => {
	it('transliterates Slovak letters instead of dropping them', () => {
		expect(slugify('Kaštieľ Ťahanovce Žilina')).toBe('kastiel-tahanovce-zilina');
		expect(slugify('Všeobecné Novinky')).toBe('vseobecne-novinky');
		expect(slugify('Reduta – Spišská Nová Ves')).toBe('reduta-spisska-nova-ves');
	});
	it('collapses symbols and respects the length limit', () => {
		expect(slugify('!!! ###')).toBe('');
		expect(slugify('a'.repeat(80)).length).toBe(48);
		expect(slugify('ab ' + 'c'.repeat(60), 10)).toBe('ab-ccccccc');
	});
});

describe('safe URLs', () => {
	it('accepts only http(s)', () => {
		expect(isHttpUrl('https://reduta.sk')).toBe(true);
		expect(isHttpUrl("javascript:fetch('/x')")).toBe(false);
		expect(isHttpUrl('data:text/html,hi')).toBe(false);
		expect(isHttpUrl('https://user:pw@reduta.sk')).toBe(false);
		expect(safeHref('javascript:alert(1)')).toBeNull();
	});
	it('normalises typed website addresses', () => {
		expect(normaliseWebsite('www.reduta.sk')).toBe('https://www.reduta.sk/');
		expect(normaliseWebsite('javascript:alert(1)')).toBeNull();
		expect(normaliseWebsite('localhost')).toBeNull();
		expect(normaliseWebsite('')).toBeNull();
	});
	it('refuses internal addresses for webhooks', () => {
		for (const h of ['localhost', '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.20.0.1', '169.254.169.254', '::1', 'printer.local']) expect(isPublicHostname(h), h).toBe(false);
		expect(isPublicHostname('hooks.slack.com')).toBe(true);
		expect(isSafeWebhookUrl('https://hooks.slack.com/x')).toBe(true);
		expect(isSafeWebhookUrl('http://hooks.slack.com/x')).toBe(false);
		expect(isSafeWebhookUrl('https://127.0.0.1:5899/hook')).toBe(false);
	});
});

describe('reservation status helpers', () => {
	it('translate status and dates for the viewer', () => {
		expect(statusLabel('pending', 'sk')).toBe('Čakajúca');
		expect(statusLabel('approved', 'sk')).toBe('Schválená');
		expect(statusLabel('waiting_payment', 'en')).toBe('Waiting for payment');
		expect(statusLabel('weird', 'sk')).toBe('weird');
		expect(fmtDate('2026-11-21', 'en')).toBe('21 Nov 2026');
		expect(fmtDate('2026-11-21', 'sk')).toMatch(/^21\. ?(11|nov)/);
	});
	it('read a stored timestamp as UTC, not local time', () => {
		// '2026-10-23 23:30:00' is UTC: east of Greenwich that is already the 24th.
		const instant = new Date(Date.UTC(2026, 9, 23, 23, 30));
		const expected = instant.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
		expect(fmtDate('2026-10-23 23:30:00', 'en')).toBe(expected);
	});
});
