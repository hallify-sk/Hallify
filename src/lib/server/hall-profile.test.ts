import { describe, expect, it } from 'vitest';
import { hallWebsite, validateHallPatch } from './hall-profile';

// No org_amenities table: only the built-in amenities are allowed.
const db = { prepare: () => { throw new Error('no table'); } } as unknown as App.Locals['db'];

describe('validateHallPatch', () => {
	it('keeps only the fields given, trimmed', async () => {
		const r = await validateHallPatch(db, 'org', { name: '  Reduta ', description: null, max_people: 350 });
		expect(r).toEqual({ ok: true, patch: { name: 'Reduta', max_people: 350 } });
	});

	it('refuses what the hall form would refuse', async () => {
		expect((await validateHallPatch(db, 'org', { max_people: 0 })).ok).toBe(false);
		expect((await validateHallPatch(db, 'org', { max_people: 12.5 })).ok).toBe(false);
		expect((await validateHallPatch(db, 'org', { price_band: 4 })).ok).toBe(false);
		expect((await validateHallPatch(db, 'org', { contact_email: 'not-an-email' })).ok).toBe(false);
		expect((await validateHallPatch(db, 'org', { contact_phone: 'call us!' })).ok).toBe(false);
	});

	it('normalises a website and drops amenities the org does not have', async () => {
		const r = await validateHallPatch(db, 'org', { contact_website: 'www.mkc.snv.sk/', amenities: ['parking', 'jacuzzi', 'parking'] });
		expect(r).toEqual({ ok: true, patch: { contact_website: 'https://www.mkc.snv.sk', amenities: ['parking'] } });
	});

	it('reads opening hours per day and rejects malformed times', async () => {
		const ok = await validateHallPatch(db, 'org', { opening_hours: [
			{ day: 'mon', open: true, from: '08:00', to: '16:00' },
			{ day: 'sun', open: false, from: '', to: '' },
			{ day: 'someday', open: true, from: '08:00', to: '16:00' }
		] });
		expect(ok).toEqual({ ok: true, patch: { opening_hours: {
			mon: { open: true, from: '08:00', to: '16:00' },
			sun: { open: false, from: '09:00', to: '22:00' }
		} } });
		expect((await validateHallPatch(db, 'org', { opening_hours: [{ day: 'mon', open: true, from: '8', to: '16:00' }] })).ok).toBe(false);
	});
});

describe('hallWebsite', () => {
	it('keeps http(s) addresses and refuses everything a link must not be', () => {
		expect(hallWebsite('www.reduta.sk')).toBe('https://www.reduta.sk');
		expect(hallWebsite('https://reduta.sk/sala?x=1')).toBe('https://reduta.sk/sala?x=1');
		expect(hallWebsite("javascript:fetch('/x?d='+document.domain)")).toBeNull();
		expect(hallWebsite('data:text/html,hi')).toBeNull();
		expect(hallWebsite('http://localhost:8080')).toBeNull();
		expect(hallWebsite('not a site')).toBeNull();
	});
});
