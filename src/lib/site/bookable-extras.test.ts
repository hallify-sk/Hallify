import { describe, expect, it } from 'vitest';
import { withinExtrasLimit, loadBookableExtras } from './bookable-extras';

describe('withinExtrasLimit', () => {
	it('keeps the oldest extras up to the plan limit', () => {
		expect(withinExtrasLimit([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
		expect(withinExtrasLimit([1, 2], 3)).toEqual([1, 2]);
		expect(withinExtrasLimit([1, 2, 3], -1)).toEqual([1, 2, 3]);
		expect(withinExtrasLimit([1, 2, 3], 0)).toEqual([]);
	});
});

describe('loadBookableExtras', () => {
	const extras = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: id }));
	const db = {
		prepare(sql: string) {
			const stmt = {
				bind: () => stmt,
				all: async () => ({ results: sql.includes('hall_extras') ? extras : [] }),
				first: async () => (sql.includes('subscriptions') ? { plan: 'free' } : null)
			};
			return stmt;
		}
	} as never;

	it('hides extras above the Free limit after a downgrade', async () => {
		expect((await loadBookableExtras(db, 'h', 'o')).map((e) => e.id)).toEqual(['a', 'b', 'c']);
	});

	it('keeps an extra the client already ordered', async () => {
		expect((await loadBookableExtras(db, 'h', 'o', ['e'])).map((e) => e.id)).toEqual(['a', 'b', 'c', 'e']);
	});
});
