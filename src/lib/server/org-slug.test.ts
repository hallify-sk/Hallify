import { describe, expect, it } from 'vitest';
import { uniqueOrgSlug } from './org-slug';
import { d1, sqliteWithSchema } from './test-d1';

describe('uniqueOrgSlug', () => {
	it('transliterates Slovak letters instead of dropping them', async () => {
		const db = d1(sqliteWithSchema());
		expect(await uniqueOrgSlug(db, 'Kaštieľ Ťahanovce Žilina')).toBe('kastiel-tahanovce-zilina');
	});

	it('skips slugs held by live organisations and reserved labels', async () => {
		const sqlite = sqliteWithSchema();
		sqlite.exec("INSERT INTO organizations (id, name, slug) VALUES ('o1', 'Sála', 'sala')");
		const db = d1(sqlite);
		expect(await uniqueOrgSlug(db, 'Sála')).toBe('sala-2');
		expect(await uniqueOrgSlug(db, 'Admin')).toBe('admin-2');
	});

	it('never reuses the slug of a closed organisation', async () => {
		const sqlite = sqliteWithSchema();
		sqlite.exec("INSERT INTO closed_organizations (id, org_id, name, slug) VALUES ('c1', 'gone', 'Grand', 'grand')");
		expect(await uniqueOrgSlug(d1(sqlite), 'Grand')).toBe('grand-2');
	});

	it('falls back to "org" for a name with no usable letters', async () => {
		expect(await uniqueOrgSlug(d1(sqliteWithSchema()), '!!!')).toBe('org');
	});
});
