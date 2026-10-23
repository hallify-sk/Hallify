import { describe, expect, it } from 'vitest';
import type { HallExtraRow } from '$lib/db/index';
import { computeExtras, parseExtrasSnapshot, snapshotExtras, withBookedPrices } from './extras';

const extra = (id: string, price: number, pricing: 'fixed' | 'per_guest' = 'fixed'): HallExtraRow => ({
	id, hall_id: 'h1', name: `Extra ${id}`, description: null, price_cents: price, pricing, created_at: '2026-01-01',
});

describe('extras price snapshot (I8)', () => {
	it('prices a new selection from the current list', () => {
		const snap = snapshotExtras(['a', 'b'], [extra('a', 1000), extra('b', 500, 'per_guest')]);
		expect(snap).toEqual([
			{ id: 'a', name: 'Extra a', description: null, pricing: 'fixed', price_cents: 1000 },
			{ id: 'b', name: 'Extra b', description: null, pricing: 'per_guest', price_cents: 500 },
		]);
	});

	it('keeps the booked price of an extra that was already booked', () => {
		const before = snapshotExtras(['a'], [extra('a', 1000)]);
		// The venue raised the price, and the client adds a second extra.
		const after = snapshotExtras(['a', 'b'], [extra('a', 1500), extra('b', 200)], before);
		expect(after.map((s) => [s.id, s.price_cents])).toEqual([['a', 1000], ['b', 200]]);
	});

	it('drops ids that are neither booked nor offered', () => {
		expect(snapshotExtras(['zzz'], [extra('a', 1000)])).toEqual([]);
	});

	it('a price edit no longer changes the agreed total', () => {
		const snap = snapshotExtras(['a', 'b'], [extra('a', 1000), extra('b', 500, 'per_guest')]);
		const today = [extra('a', 9999), extra('b', 700, 'per_guest')];
		const priced = withBookedPrices(today, snap);
		expect(computeExtras(priced, ['a', 'b'], 10).totalCents).toBe(1000 + 500 * 10);
		expect(priced.find((p) => p.id === 'a')?.live_price_cents).toBe(9999);
		// Without a snapshot (an old booking), today's prices apply as before.
		expect(computeExtras(withBookedPrices(today, []), ['a'], 10).totalCents).toBe(9999);
	});

	it('keeps a booked extra the venue has since deleted', () => {
		const snap = snapshotExtras(['a', 'gone'], [extra('a', 1000), extra('gone', 300)]);
		const priced = withBookedPrices([extra('a', 1000)], snap);
		const gone = priced.find((p) => p.id === 'gone');
		expect(gone?.retired).toBe(true);
		expect(computeExtras(priced, ['a', 'gone'], 1).totalCents).toBe(1300);
	});

	it('reads only well-formed snapshot entries', () => {
		expect(parseExtrasSnapshot(null)).toEqual([]);
		expect(parseExtrasSnapshot('not json')).toEqual([]);
		expect(parseExtrasSnapshot('{"id":"a"}')).toEqual([]);
		expect(parseExtrasSnapshot('[{"id":"a","name":"A","pricing":"per_guest","price_cents":"250"},{"name":"no id"},null]'))
			.toEqual([{ id: 'a', name: 'A', description: null, pricing: 'per_guest', price_cents: 250 }]);
	});
});
