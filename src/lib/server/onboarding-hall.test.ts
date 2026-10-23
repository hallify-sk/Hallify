import { describe, expect, it } from 'vitest';
import { uniqueHallSlug } from './onboarding-hall';
import { d1, sqliteWithSchema } from './test-d1';

describe('uniqueHallSlug', () => {
	it('derives a Slovak-safe slug and avoids every existing one, in any organisation', async () => {
		const sqlite = sqliteWithSchema();
		sqlite.exec(`
			INSERT INTO organizations (id, name, slug) VALUES ('a', 'A', 'a'), ('b', 'B', 'b');
			INSERT INTO halls (id, org_id, name, max_people, slug) VALUES ('h1', 'b', 'Veľká sála', 50, 'velka-sala');
		`);
		const db = d1(sqlite);
		expect(await uniqueHallSlug(db, 'Malá sála')).toBe('mala-sala');
		expect(await uniqueHallSlug(db, 'Veľká sála')).toBe('velka-sala-2');
	});

	it('never takes a path the venue site already uses', async () => {
		const db = d1(sqliteWithSchema());
		expect(await uniqueHallSlug(db, 'Messages')).toBe('messages-2');
		expect(await uniqueHallSlug(db, '***')).toBe('sala');
	});
});
