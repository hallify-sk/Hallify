import { describe, expect, it } from 'vitest';
import { resolveOpeningHours, closedWeekdays, DEFAULT_DAY_HOURS } from './opening-hours';
import { amenityLabelMap, amenityLabel, humanizeAmenityKey } from './amenities';
import { displayWebsite } from './display-url';
import { brandName, brandLogo, brandAccentStyle } from './brand';
import { contrastRatio } from '$lib/contrast';

describe('resolveOpeningHours', () => {
	it('is null when the venue never set hours', () => {
		expect(resolveOpeningHours(null)).toBeNull();
		expect(resolveOpeningHours('')).toBeNull();
		expect(resolveOpeningHours('{}')).toBeNull();
		expect(resolveOpeningHours('not json')).toBeNull();
	});

	it('fills days nobody edited with the console default instead of closing them', () => {
		const week = resolveOpeningHours(JSON.stringify({ mon: { open: false, from: '09:00', to: '22:00' } }))!;
		expect(week.map((d) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
		expect(week[0].hours.open).toBe(false);
		for (const d of week.slice(1)) expect(d.hours).toEqual(DEFAULT_DAY_HOURS);
	});

	it('keeps edited times and accepts an object', () => {
		const week = resolveOpeningHours({ fri: { open: true, from: '16:00', to: '02:00' } })!;
		expect(week[4].hours).toEqual({ open: true, from: '16:00', to: '02:00' });
	});
});

describe('closedWeekdays', () => {
	it('returns JS day numbers of explicitly closed days only', () => {
		expect(closedWeekdays(JSON.stringify({ mon: { open: false }, sun: { open: false }, tue: { open: true } }))).toEqual([0, 1]);
		expect(closedWeekdays(null)).toEqual([]);
		expect(closedWeekdays('{"wed":{}}')).toEqual([]);
	});

	it('reads the older numeric keys too', () => {
		expect(closedWeekdays({ '6': { open: false } })).toEqual([6]);
	});
});

describe('amenity labels', () => {
	const custom = [{ slug: 'custom-virivka', label_sk: 'Vírivka', label_en: '' }];
	it('names custom amenities in the current language, falling back to the other', () => {
		const sk = amenityLabelMap({ wifi: 'WiFi' }, custom, 'sk');
		const en = amenityLabelMap({ wifi: 'WiFi' }, custom, 'en');
		expect(amenityLabel('custom-virivka', sk)).toBe('Vírivka');
		expect(amenityLabel('custom-virivka', en)).toBe('Vírivka');
		expect(amenityLabel('wifi', en)).toBe('WiFi');
	});

	it('never prints a raw key', () => {
		expect(humanizeAmenityKey('custom-sauna-a-bazen')).toBe('Sauna a bazen');
		expect(amenityLabel('custom-terasa', {})).toBe('Terasa');
	});
});

describe('displayWebsite', () => {
	it('refuses anything that is not http(s)', () => {
		expect(displayWebsite("javascript:fetch('/x?d='+document.domain)")).toBeNull();
		expect(displayWebsite('data:text/html,hi')).toBeNull();
		expect(displayWebsite('')).toBeNull();
	});

	it('shortens long addresses for display but keeps the full link', () => {
		const long = 'https://www.example.com/' + 'a'.repeat(200) + '?utm_source=x';
		const w = displayWebsite(long)!;
		expect(w.href).toBe(new URL(long).toString());
		expect(w.label.length).toBeLessThanOrEqual(40);
		expect(w.label.startsWith('example.com/')).toBe(true);
		expect(displayWebsite('https://reduta.sk/')!.label).toBe('reduta.sk');
	});
});

describe('venue branding', () => {
	it('uses the saved display name unless it is empty or the platform default', () => {
		expect(brandName({ appName: 'Sála Zlatý Klas' }, 'E2E Org')).toBe('Sála Zlatý Klas');
		expect(brandName({ appName: 'Hallify' }, 'E2E Org')).toBe('E2E Org');
		expect(brandName({ appName: '  ' }, 'E2E Org')).toBe('E2E Org');
		expect(brandName(null, 'E2E Org')).toBe('E2E Org');
	});

	it('uses an uploaded logo, never a script URL or the platform logo', () => {
		expect(brandLogo({ logoUrl: '/uploads/logo.png' }, null)).toBe('/uploads/logo.png');
		expect(brandLogo({ logoUrl: '/Hallify.svg' }, null)).toBeNull();
		expect(brandLogo({ logoUrl: 'javascript:alert(1)' }, '/org.png')).toBe('/org.png');
		expect(brandLogo({ logoUrl: '//evil.example/x.png' }, null)).toBeNull();
	});

	it('writes the accent over the template, with text tones that stay readable', () => {
		const style = brandAccentStyle({ primaryColor: '#2a9d55' }, '#f9f9f7');
		expect(style).toContain('--accent:#2a9d55');
		const ink = /--accent-ink:(#[0-9a-f]{6})/i.exec(style)![1];
		expect(contrastRatio(ink, '#f9f9f7')!).toBeGreaterThanOrEqual(4.5);
		const dark = brandAccentStyle({ primaryColor: '#2a3d55' }, '#121212');
		const darkInk = /--accent-ink:(#[0-9a-f]{6})/i.exec(dark)![1];
		expect(contrastRatio(darkInk, '#121212')!).toBeGreaterThanOrEqual(4.5);
	});

	it('adds nothing for a missing or malformed colour', () => {
		expect(brandAccentStyle({}, '#fff')).toBe('');
		expect(brandAccentStyle({ primaryColor: 'red;--x:1' }, '#ffffff')).toBe('');
	});
});
