import { describe, expect, it } from 'vitest';
import { countSeats, floorDisplayName, zoneDisplayLabel } from './floorplan-types';

const table = (over: Record<string, unknown>) => ({
	id: 't', x: 0, y: 0, width: 2, height: 1, radius: 0.8, shape: 'rect', chairs: 0, rotation: 0, label: '',
	chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.15, assignments: [], ...over
});

describe('countSeats', () => {
	it('counts round tables by their chairs, not their (stale) per-side numbers', () => {
		// A round table converted from a rectangle keeps old per-side counts around.
		const layout = { version: 2, guests: [], floors: [{ id: 'f', name: 'F', walls: [], zones: [], bounds: null, seats: [],
			tables: [table({ shape: 'round', chairs: 10, chairsTop: 3, chairsBottom: 3 })] }] };
		expect(countSeats(layout)).toBe(10);
	});

	it('counts standalone chairs as seats, as the editor does', () => {
		const layout = { version: 2, guests: [], floors: [{ id: 'f', name: 'F', walls: [], zones: [], bounds: null,
			tables: [table({ chairsTop: 4, chairsBottom: 4 })],
			seats: Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, x: i, y: 5, rotation: 0, assignment: null })) }] };
		expect(countSeats(layout)).toBe(24);
	});

	it('adds every floor and falls back to the flat count on legacy rectangles', () => {
		const layout = JSON.stringify({ version: 2, guests: [], floors: [
			{ id: 'a', name: 'A', walls: [], zones: [], bounds: null, tables: [table({ chairs: 6 })] },
			{ id: 'b', name: 'B', walls: [], zones: [], bounds: null, tables: [table({ shape: 'round', chairs: 8 })], seats: [{ id: 's', x: 0, y: 0, rotation: 0, assignment: null }] }
		] });
		expect(countSeats(layout)).toBe(15);
	});

	it('is zero for nothing at all', () => {
		expect(countSeats(null)).toBe(0);
	});
});

describe('default floor and zone names', () => {
	const floor = (n: number) => `Poschodie ${n}`;
	const zone = (n: number) => `Zóna ${n}`;
	it('shows the stored English defaults in the viewer\'s language', () => {
		expect(floorDisplayName('Floor 1', 0, floor)).toBe('Poschodie 1');
		expect(floorDisplayName('Floor 3', 1, floor)).toBe('Poschodie 3');
		expect(floorDisplayName('', 1, floor)).toBe('Poschodie 2');
		expect(zoneDisplayLabel('Zone 2', zone)).toBe('Zóna 2');
	});
	it('keeps a name someone typed', () => {
		expect(floorDisplayName('Prízemie', 0, floor)).toBe('Prízemie');
		expect(floorDisplayName('Floor plan B', 0, floor)).toBe('Floor plan B');
		expect(zoneDisplayLabel('Pódium', zone)).toBe('Pódium');
		expect(zoneDisplayLabel('', zone)).toBe('');
	});
});
