import { describe, expect, it } from 'vitest';
import { planSeating, type CircleGroup } from './seating-plan';
import type { SeatingTable } from '$lib/seating';

const table = (id: string, chairs: number): SeatingTable => ({ floorId: 'f', id, label: id, assignments: Array.from({ length: chairs }, () => null) });
const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
const group = (name: string, circle: string | null, n: number, keepTogether = true): CircleGroup =>
	({ name, circle, keepTogether, preferredTable: null, guestIds: ids(`${name}-`, n) });
const tablesOf = (r: ReturnType<typeof planSeating>, guest: string) => r.tables.find((t) => t.assignments.includes(guest))?.id;

describe('planSeating', () => {
	// The end-to-end test's wedding: 23 guests, four tables of eight, circles handed
	// over as couples. The first plan packed 8/8/7/0 and split the colleagues.
	const wedding = () => [
		group('Babka a dedko', 'Rodina', 4), group('Rodičia', 'Rodina', 4),
		group('Kráľovci', 'Kolegovia z práce', 2), group('Horvátovci', 'Kolegovia z práce', 2), group('Tomáš', 'Kolegovia z práce', 1, false),
		group('Pár 1', 'Kamaráti', 2), group('Pár 2', 'Kamaráti', 2), group('Pár 3', 'Kamaráti', 2),
		group('Susedia A', 'Susedia', 2), group('Susedia B', 'Susedia', 2)
	];

	it('keeps every listed circle at one table and uses all the tables', () => {
		const r = planSeating([table('t1', 8), table('t2', 8), table('t3', 8), table('t4', 8)], wedding(), { keepExisting: false });
		for (const circle of [['Kráľovci-0', 'Horvátovci-1', 'Tomáš-0'], ['Pár 1-0', 'Pár 2-1', 'Pár 3-0'], ['Babka a dedko-0', 'Rodičia-3']]) {
			expect(new Set(circle.map((g) => tablesOf(r, g))).size).toBe(1);
		}
		expect(r.tables.every((t) => t.assignments.some(Boolean))).toBe(true);
		expect(r.split).toEqual([]);
		expect(r.unseated).toEqual([]);
	});

	it('says which circle had to be split when the tables cannot hold it whole', () => {
		const r = planSeating([table('t1', 6), table('t2', 6)], [
			group('A', 'Kolegovia', 2), group('B', 'Kolegovia', 2), group('C', 'Kolegovia', 2), group('D', 'Kolegovia', 2)
		], { keepExisting: false });
		expect(r.unseated).toEqual([]);
		expect(r.split).toEqual(['Kolegovia']);
		// The couples themselves stay whole.
		for (const g of ['A', 'B', 'C', 'D']) expect(tablesOf(r, `${g}-0`)).toBe(tablesOf(r, `${g}-1`));
	});

	it('behaves like plain group seating when no circles are given', () => {
		const r = planSeating([table('t1', 4), table('t2', 4)], [group('X', null, 3), group('Y', null, 3)], { keepExisting: false });
		expect(tablesOf(r, 'X-0')).not.toBe(tablesOf(r, 'Y-0'));
		expect(r.split).toEqual([]);
	});
});
