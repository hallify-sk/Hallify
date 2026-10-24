import { describe, expect, it } from 'vitest';
import { hallProfileVersion, hallWebsite, PROFILE_COLUMNS, profileUnchangedGuard, validateHallPatch } from './hall-profile';
import { migratedDatabase, d1 } from './sqlite-d1.testutil';
import { dbRun, wroteRow } from '$lib/db/index';

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

describe('saving the profile over the version it was loaded from (B111)', () => {
	const row = { name: 'Reduta', max_people: 350, latitude: 48.71, longitude: 21.25, amenities: '["wifi"]', slug: 'reduta' };

	it('has one version per stored profile, and a new one when any profile column changes', async () => {
		const v = await hallProfileVersion(row);
		expect(await hallProfileVersion({ ...row })).toBe(v);
		expect(await hallProfileVersion({ ...row, name: 'Reduta 2' })).not.toBe(v);
		expect(await hallProfileVersion({ ...row, latitude: 48.72 })).not.toBe(v);
		// Columns the profile form does not write do not count.
		expect(await hallProfileVersion({ ...row, floorplan_json: '{}' } as typeof row)).toBe(v);
	});

	it('guards the write: a save that raced another writes nothing', async () => {
		const s = migratedDatabase();
		try {
			s.exec(`INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel')`);
			s.exec(`INSERT INTO halls (id, org_id, name, slug, latitude, longitude) VALUES ('h1', 'org', 'Sála', 'sala', 48.71, 21.25)`);
			const read = s.prepare(`SELECT ${PROFILE_COLUMNS.join(', ')} FROM halls WHERE id = 'h1'`).get() as Record<string, unknown>;
			const save = (name: string) => {
				const g = profileUnchangedGuard(read);
				return dbRun(d1(s), `UPDATE halls SET name = ? WHERE id = ?${g.sql}`, name, 'h1', ...g.params);
			};
			expect(wroteRow(await save('Prvá'))).toBe(true);
			// The second save was made from the same read, before the first one landed.
			expect(wroteRow(await save('Druhá'))).toBe(false);
			expect((s.prepare(`SELECT name FROM halls WHERE id = 'h1'`).get() as { name: string }).name).toBe('Prvá');
		} finally {
			s.close();
		}
	});
});
