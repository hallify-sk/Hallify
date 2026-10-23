import { describe, expect, it } from 'vitest';
import { applyTemplateKeepingGuests, arrangementKey, layoutVersion } from './floorplan-layout';

const table = (id: string, over: Record<string, unknown> = {}) => ({
	id, x: 2, y: 2, width: 2, height: 1, radius: 0.8, shape: 'rect', chairs: 0, rotation: 0, label: id,
	chairsTop: 2, chairsBottom: 2, chairsLeft: 0, chairsRight: 0, chairSpacing: 0.15, assignments: [null, null, null, null], ...over
});
const floor = (tables: unknown[], seats: unknown[] = []) => ({ id: 'f1', name: 'Sála', walls: [], zones: [], bounds: null, tables, seats });
const guests = ['a', 'b', 'c', 'd'].map((id) => ({ id, firstName: id.toUpperCase(), lastName: 'X' }));

describe('applyTemplateKeepingGuests', () => {
	const current = {
		version: 2, guests,
		floors: [floor(
			[table('t1', { assignments: ['a', 'b', null, null] }), table('t2', { assignments: ['c', null, null, null] })],
			[{ id: 's1', x: 9, y: 9, rotation: 0, assignment: 'd' }]
		)]
	};

	it('keeps every guest and re-seats those whose chair still exists', () => {
		// The template keeps t1 (now with only two chairs) and the standalone chair, and drops t2.
		const template = JSON.stringify({ version: 2, guests: [], floors: [floor(
			[table('t1', { chairsTop: 1, chairsBottom: 1, assignments: ['zzz', null] }), table('t9')],
			[{ id: 's1', x: 1, y: 1, rotation: 0, assignment: null }]
		)] });
		const out = applyTemplateKeepingGuests(current, template);
		expect(out.layout.guests.map((g) => g.id)).toEqual(['a', 'b', 'c', 'd']);
		const [t1, t9] = out.layout.floors[0].tables;
		expect(t1.assignments).toEqual(['a', 'b']);
		expect(t9.assignments).toEqual([null, null, null, null]);
		expect(out.layout.floors[0].seats?.[0].assignment).toBe('d');
		expect(out.reseated).toBe(3);
		expect(out.unseated).toBe(1);
	});

	it('leaves everyone unseated, but listed, on a template with other tables', () => {
		const out = applyTemplateKeepingGuests(current, { version: 2, guests: [], floors: [floor([table('new')])] });
		expect(out.layout.guests).toHaveLength(4);
		expect(out.layout.floors[0].tables[0].assignments.every((a) => a === null)).toBe(true);
		expect(out.reseated).toBe(0);
		expect(out.unseated).toBe(4);
	});

	it('does not touch its inputs', () => {
		const before = JSON.stringify(current);
		applyTemplateKeepingGuests(current, { version: 2, guests: [], floors: [floor([table('t1')])] });
		expect(JSON.stringify(current)).toBe(before);
	});
});

describe('layoutVersion', () => {
	it('is stable for the same text and differs for any other', async () => {
		const a = await layoutVersion('{"version":2}');
		expect(a).toMatch(/^[0-9a-f]{24}$/);
		expect(await layoutVersion('{"version":2}')).toBe(a);
		expect(await layoutVersion('{"version":2 }')).not.toBe(a);
		expect(await layoutVersion(null)).toBe(await layoutVersion(''));
	});
});

describe('arrangementKey', () => {
	const base = { version: 2, guests, floors: [floor([table('t1')], [{ id: 's1', x: 1, y: 1, rotation: 0, assignment: null }])] };

	it('ignores who sits where, the guest list and table notes', () => {
		const seated = JSON.parse(JSON.stringify(base));
		seated.floors[0].tables[0].assignments = ['a', 'b', null, null];
		seated.floors[0].tables[0].note = 'one high chair';
		seated.floors[0].seats[0].assignment = 'c';
		seated.guests = [];
		expect(arrangementKey(JSON.stringify(seated))).toBe(arrangementKey(base));
	});

	it('changes when a table moves, gains chairs or disappears', () => {
		const moved = JSON.parse(JSON.stringify(base));
		moved.floors[0].tables[0].x = 3;
		expect(arrangementKey(moved)).not.toBe(arrangementKey(base));
		const more = JSON.parse(JSON.stringify(base));
		more.floors[0].tables[0].chairsLeft = 1;
		expect(arrangementKey(more)).not.toBe(arrangementKey(base));
		const gone = JSON.parse(JSON.stringify(base));
		gone.floors[0].seats = [];
		expect(arrangementKey(gone)).not.toBe(arrangementKey(base));
	});
});
