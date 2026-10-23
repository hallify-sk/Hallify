import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { d1, migratedSqlite } from './test-d1';
import { hallSlug, isReservedHallSlug, nextUntitledHallName, uniqueHallSlug } from './hall-naming';

function seeded() {
	// The schema this branch started from: other branches' migrations (0015–0021)
	// are theirs to test, and 0022 touches only columns that exist since 0006.
	const sqlite = migratedSqlite('0014');
	sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Org one','one'), ('o2','Org two','two')");
	return sqlite;
}

describe('hall slugs', () => {
	it('transliterates Slovak names', () => {
		expect(hallSlug('Kaštieľ Ťahanovce – Veľká sála')).toBe('kastiel-tahanovce-velka-sala');
	});

	it('refuses reserved words', () => {
		expect(isReservedHallSlug('messages')).toBe(true);
		expect(isReservedHallSlug('my-reservations')).toBe(true);
		expect(isReservedHallSlug('velka-sala')).toBe(false);
	});

	it('numbers a taken slug and skips reserved ones', async () => {
		const sqlite = seeded();
		const db = d1(sqlite);
		expect(await uniqueHallSlug(db, 'Veľká sála')).toBe('velka-sala');
		sqlite.exec("INSERT INTO halls(id,org_id,name,slug) VALUES ('h1','o2','x','velka-sala'), ('h2','o1','y','velka-sala-2')");
		expect(await uniqueHallSlug(db, 'Veľká sála')).toBe('velka-sala-3');
		// A hall keeps its own slug.
		expect(await uniqueHallSlug(db, 'Veľká sála', 'h1')).toBe('velka-sala');
		expect(await uniqueHallSlug(db, 'Messages')).toBe('messages-sala');
		expect(await uniqueHallSlug(db, '???')).toBe('sala');
	});

	it('numbers default hall names within the organisation', async () => {
		const sqlite = seeded();
		const db = d1(sqlite);
		expect(await nextUntitledHallName(db, 'o1', 'Nová sála')).toBe('Nová sála');
		sqlite.exec("INSERT INTO halls(id,org_id,name) VALUES ('a','o1','Nová sála'), ('b','o1','Nová sála 2'), ('c','o2','Nová sála 3')");
		expect(await nextUntitledHallName(db, 'o1', 'Nová sála')).toBe('Nová sála 3');
	});
});

describe('migration 0022', () => {
	const sql = readFileSync(new URL('../../../migrations/0022_hall_slugs_and_profile_cleanup.sql', import.meta.url), 'utf8');

	it('backfills unique slugs without touching existing ones', () => {
		const sqlite = seeded();
		sqlite.exec(`INSERT INTO halls(id,org_id,name,slug) VALUES
			('aaaaaaaa-1','o1','Nová sála',NULL),
			('bbbbbbbb-2','o2','Nová sála',NULL),
			('cccccccc-3','o1','Kaštieľ & Záhrada',NULL),
			('dddddddd-4','o1','Taken','taken'),
			('eeeeeeee-5','o2','Taken',NULL),
			('ffffffff-6','o2','???',NULL),
			('gggggggg-7','o2','Messages',NULL)`);
		sqlite.exec(sql);
		sqlite.exec(sql); // idempotent
		const slugs = Object.fromEntries(sqlite.prepare('SELECT id, slug FROM halls').all().map((r) => [r.id, r.slug]));
		expect(slugs['aaaaaaaa-1']).toBe('nova-sala');
		expect(slugs['bbbbbbbb-2']).toBe('nova-sala-bbbbbbbb');
		expect(slugs['cccccccc-3']).toBe('kastiel-zahrada');
		expect(slugs['dddddddd-4']).toBe('taken');
		expect(slugs['eeeeeeee-5']).toBe('taken-eeeeeeee');
		expect(slugs['ffffffff-6']).toBe('sala');
		expect(slugs['gggggggg-7']).toBe('sala-gggggggg');
	});

	it('removes non-http website links and completes bare addresses', () => {
		const sqlite = seeded();
		sqlite.exec(`INSERT INTO halls(id,org_id,name,slug,contact_website) VALUES
			('1','o1','a','a','javascript:alert(1)'),
			('2','o1','b','b','www.reduta.sk'),
			('3','o1','c','c','https://reduta.sk'),
			('4','o1','d','d','  ')`);
		sqlite.exec(sql);
		const w = Object.fromEntries(sqlite.prepare('SELECT id, contact_website FROM halls').all().map((r) => [r.id, r.contact_website]));
		expect(w).toEqual({ 1: null, 2: 'https://www.reduta.sk', 3: 'https://reduta.sk', 4: null });
	});

	it('drops deleted custom amenities and fills missing opening days', () => {
		const sqlite = seeded();
		sqlite.exec("INSERT INTO org_amenities(id,org_id,slug,label_sk) VALUES ('x','o1','custom-virivka','Vírivka')");
		sqlite.exec(`INSERT INTO halls(id,org_id,name,slug,amenities,opening_hours) VALUES
			('1','o1','a','a','["wifi","custom-virivka","custom-gone"]','{"mon":{"open":false,"from":"09:00","to":"22:00"}}'),
			('2','o1','b','b','["wifi"]','{}')`);
		sqlite.exec(sql);
		const rows = sqlite.prepare('SELECT id, amenities, opening_hours FROM halls ORDER BY id').all() as { amenities: string; opening_hours: string }[];
		expect(JSON.parse(rows[0].amenities)).toEqual(['wifi', 'custom-virivka']);
		const hours = JSON.parse(rows[0].opening_hours);
		expect(Object.keys(hours).sort()).toEqual(['fri', 'mon', 'sat', 'sun', 'thu', 'tue', 'wed']);
		expect(hours.mon.open).toBe(false);
		expect(hours.sun).toEqual({ open: true, from: '09:00', to: '22:00' });
		expect(rows[1].opening_hours).toBe('{}');
	});
});
