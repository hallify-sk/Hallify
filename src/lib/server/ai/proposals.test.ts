import { describe, expect, it } from 'vitest';
import { savedDraftOutcome, type SeatingPayload } from './proposals';

const layout = (tables: { id: string; assignments: (string | null)[] }[], guests: string[] = [], walls: { id: string }[] = [], zones: { id: string }[] = []) =>
	JSON.stringify({
		version: 2,
		floors: [{
			id: 'f', name: 'F', bounds: null, seats: [],
			walls: walls.map((w) => ({ ...w, points: [] })),
			zones: zones.map((z) => ({ ...z, points: [], color: '#000', label: '' })),
			tables: tables.map((t) => ({ ...t, x: 0, y: 0, width: 1, height: 1, radius: 1, shape: 'round', chairs: t.assignments.length, rotation: 0, label: t.id,
				chairsTop: 0, chairsBottom: 0, chairsLeft: 0, chairsRight: 0, chairSpacing: 0 }))
		}],
		guests: guests.map((id) => ({ id, firstName: id, lastName: '' }))
	});

const seatingPlan: SeatingPayload = {
	reservationId: 'r', title: 'Svadba', baseHash: 'x', keepExisting: false,
	newGuests: [{ id: 'g1', firstName: 'A', lastName: '' }, { id: 'g2', firstName: 'B', lastName: '' }],
	tables: [{ floorId: 'f', id: 't1', label: '1', assignments: ['g1', 'g2', null] }],
	names: {}, unseated: []
};

describe('savedDraftOutcome', () => {
	it('counts the guests the saved seating really holds', () => {
		const out = savedDraftOutcome('seating', seatingPlan, layout([{ id: 't1', assignments: ['g1', 'g2', null] }], ['g1', 'g2']));
		expect(out).toEqual({ saved: true, result: { seated: 2, editedInEditor: false, savedFromEditor: true } });
	});

	it('notices a guest moved in the editor before saving', () => {
		const out = savedDraftOutcome('seating', seatingPlan, layout([{ id: 't1', assignments: ['g1', null, null] }, { id: 't2', assignments: ['g2'] }], ['g1', 'g2']));
		expect(out).toEqual({ saved: true, result: { seated: 2, editedInEditor: true, savedFromEditor: true } });
	});

	it('is not a save of the proposal when the old, empty seating was written back', () => {
		expect(savedDraftOutcome('seating', seatingPlan, layout([{ id: 't1', assignments: [null, null, null] }]))).toEqual({ saved: false });
	});

	it('is not a save of a floor plan when none of its walls or zones are in it', () => {
		const plan = { walls: [{ id: 'w-ai', points: [] }], zones: [{ id: 'z-ai', points: [], color: '#000', label: '' }] };
		expect(savedDraftOutcome('floorplan', plan, layout([], [], [{ id: 'old1' }, { id: 'old2' }]))).toEqual({ saved: false });
		const kept = savedDraftOutcome('floorplan', plan, layout([], [], [{ id: 'w-ai' }], [{ id: 'z-ai' }]));
		expect(kept).toEqual({ saved: true, result: { saved: true, editedInEditor: false } });
	});
});
