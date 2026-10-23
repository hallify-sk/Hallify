import { describe, expect, it } from 'vitest';
import { manifestFloors } from './floorplan-manifest';
import type { MultiFloorState } from './floorplan-types';

const table = (id: string, over: Record<string, unknown> = {}) => ({
	id, x: 0, y: 0, width: 2, height: 1, radius: 0.8, shape: 'rect', chairs: 0, rotation: 0, label: 'Okrúhly stôl',
	chairsTop: 1, chairsBottom: 1, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.15, assignments: [null, null], ...over
});

describe('manifestFloors', () => {
	const layout = {
		version: 2,
		guests: [{ id: 'g1', firstName: 'Eva', lastName: 'Malá' }],
		floors: [
			{ id: 'a', name: 'Prízemie', walls: [], zones: [], bounds: null, seats: [], tables: [table('t1', { num: 4, note: 'detská stolička' }), table('t2', { assignments: ['g1', null] })] },
			{ id: 'b', name: '', walls: [], zones: [], bounds: null, seats: [{ id: 's', x: 0, y: 0, rotation: 0, assignment: 'g1' }], tables: [table('t3', { label: '' })] }
		]
	} as unknown as MultiFloorState;

	it('names tables by the same numbers as the editor, across floors', () => {
		const [ground, upper] = manifestFloors(layout, (i) => `Poschodie ${i + 1}`);
		expect(ground.tables.map((t) => t.tag)).toEqual(['T4', 'T1']);
		expect(upper.tables.map((t) => t.tag)).toEqual(['T2']);
		expect(upper.tables[0].label).toBe('T2');
		expect(upper.name).toBe('Poschodie 2');
	});

	it('carries the note for staff and only the seated chairs', () => {
		const [ground, upper] = manifestFloors(layout);
		expect(ground.tables[0].note).toBe('detská stolička');
		expect(ground.tables[1].seats).toEqual([{ idx: 0, guest: { id: 'g1', firstName: 'Eva', lastName: 'Malá' } }]);
		expect(ground.seatedCount).toBe(1);
		expect(ground.totalSeats).toBe(4);
		expect(upper.standalone).toHaveLength(1);
	});
});
