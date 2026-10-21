import { describe, expect, it } from 'vitest';
import { seatGroups, type SeatingTable } from './seating';

const table = (id: string, chairs: number, label = id, taken: (string | null)[] = []): SeatingTable => ({
	floorId: 'f', id, label,
	assignments: Array.from({ length: chairs }, (_, i) => taken[i] ?? null)
});
const at = (r: ReturnType<typeof seatGroups>, id: string) => r.tables.find((t) => t.id === id)!.assignments;

describe('seatGroups', () => {
	it('keeps a group together at the smallest table it fits', () => {
		const r = seatGroups([table('big', 10), table('small', 4)],
			[{ name: 'Novák', preferredTable: null, guestIds: ['a', 'b', 'c'] }], { keepExisting: false });
		expect(at(r, 'small')).toEqual(['a', 'b', 'c', null]);
		expect(at(r, 'big').every((a) => a === null)).toBe(true);
	});

	it('seats the largest groups first so they still find a table', () => {
		const r = seatGroups([table('t1', 4), table('t2', 4)], [
			{ name: 'pair', preferredTable: null, guestIds: ['p1', 'p2'] },
			{ name: 'four', preferredTable: null, guestIds: ['f1', 'f2', 'f3', 'f4'] }
		], { keepExisting: false });
		expect(at(r, 't1')).toEqual(['f1', 'f2', 'f3', 'f4']);
		expect(at(r, 't2')).toEqual(['p1', 'p2', null, null]);
		expect(r.unseated).toEqual([]);
	});

	it('spreads a group bigger than any table across the roomiest tables', () => {
		const r = seatGroups([table('t1', 4), table('t2', 3)],
			[{ name: 'clan', preferredTable: null, guestIds: ['1', '2', '3', '4', '5', '6'] }], { keepExisting: false });
		expect(at(r, 't1')).toEqual(['1', '2', '3', '4']);
		expect(at(r, 't2')).toEqual(['5', '6', null]);
	});

	it('honours a requested table by label, case-insensitively, and seats the overflow elsewhere', () => {
		const r = seatGroups([table('head', 2, 'Hlavný stôl'), table('t2', 6, 'Stôl 2')],
			[{ name: 'family', preferredTable: 'hlavný STÔL', guestIds: ['bride', 'groom', 'mum'] }], { keepExisting: false });
		expect(at(r, 'head')).toEqual(['bride', 'groom']);
		expect(at(r, 't2')[0]).toBe('mum');
	});

	it('keeps existing seats when asked, and never seats anyone twice', () => {
		const r = seatGroups([table('t1', 3, 't1', ['x', null, null])],
			[{ name: 'g', preferredTable: null, guestIds: ['x', 'y', 'y'] }], { keepExisting: true });
		expect(at(r, 't1')).toEqual(['x', 'y', null]);
	});

	it('reports who did not fit', () => {
		const r = seatGroups([table('t1', 2)],
			[{ name: 'g', preferredTable: null, guestIds: ['a', 'b', 'c'] }], { keepExisting: false });
		expect(r.unseated).toEqual(['c']);
	});

	it('finds a whole-group arrangement that largest-first best-fit would miss', () => {
		const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
		// Best-fit puts both 3s at one table, fills the other with three 2s and has to
		// split the last 2. Whole: 3 + 2 + 2 at each table.
		const r = seatGroups([table('t1', 7), table('t2', 7)], [
			{ name: 'A', preferredTable: null, guestIds: ids('a', 3) },
			{ name: 'B', preferredTable: null, guestIds: ids('b', 3) },
			{ name: 'C', preferredTable: null, guestIds: ids('c', 2) },
			{ name: 'D', preferredTable: null, guestIds: ids('d', 2) },
			{ name: 'E', preferredTable: null, guestIds: ids('e', 2) },
			{ name: 'F', preferredTable: null, guestIds: ids('f', 2) }
		], { keepExisting: false });
		expect(r.split).toEqual([]);
		expect(r.unseated).toEqual([]);
	});

	it('when someone must be split, keeps families whole and splits friends instead', () => {
		// The real wedding: three 8-tops, two families with their children (5 and 4),
		// colleagues (5) and friends (5). No arrangement keeps all four whole.
		const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);
		const r = seatGroups([table('t1', 8), table('t2', 8), table('t3', 8)], [
			{ name: 'Colleagues', preferredTable: null, guestIds: ids('c', 5) },
			{ name: 'Friends', preferredTable: null, guestIds: ids('f', 5) },
			{ name: 'Kováč', preferredTable: null, keepTogether: true, guestIds: ids('k', 5) },
			{ name: 'Horváth', preferredTable: null, keepTogether: true, guestIds: ids('h', 4) }
		], { keepExisting: false });
		expect(r.unseated).toEqual([]);
		expect(r.split.length).toBe(1);
		expect(['Colleagues', 'Friends']).toContain(r.split[0]);
		for (const fam of ['k', 'h']) {
			const home = r.tables.filter((t) => t.assignments.some((a) => a?.startsWith(fam)));
			expect(home.length).toBe(1);
		}
	});

	it('never fills a head table automatically, only with the groups that asked for it', () => {
		const r = seatGroups([table('head', 4, 'Hlavný stôl'), table('t1', 8, 'Stôl 1')], [
			{ name: 'Novák', preferredTable: null, keepTogether: true, guestIds: ['n1', 'n2', 'n3'] }
		], { keepExisting: false });
		expect(at(r, 'head').every((a) => a === null)).toBe(true);
		expect(at(r, 't1').slice(0, 3)).toEqual(['n1', 'n2', 'n3']);
	});

	it('keeps tables the caller reserves free, by label', () => {
		const r = seatGroups([table('a', 4, 'Pri pódiu'), table('b', 8, 'Stôl 2')], [
			{ name: 'g', preferredTable: null, guestIds: ['x', 'y'] }
		], { keepExisting: false, reserved: ['pri pódiu'] });
		expect(at(r, 'a').every((a) => a === null)).toBe(true);
	});
});
