import { describe, expect, it } from 'vitest';
import { stepsFor, toolsFor, stepForTool, toolForKey, TOOL_KEYS, type ToolContext } from './editor-steps';

const room: ToolContext = { hasTableTypes: false, tablesFromTypesOnly: false, allowZones: true, shellEditable: true };
const event: ToolContext = { hasTableTypes: true, tablesFromTypesOnly: true, allowZones: true, shellEditable: false };

describe('stepsFor', () => {
	it('walks the room editor through shape, walls, zones and a check', () => {
		expect(stepsFor('room')).toEqual(['room', 'walls', 'zones', 'check']);
	});
	it('gives templates no guest step and events one', () => {
		expect(stepsFor('template')).toEqual(['tables', 'chairs', 'check']);
		expect(stepsFor('event')).toEqual(['tables', 'chairs', 'guests', 'check']);
	});
});

describe('toolsFor', () => {
	it('starts every step with Select and ends editing steps with Measure', () => {
		for (const step of ['room', 'walls', 'zones', 'tables', 'chairs'] as const) {
			const tools = toolsFor(step, step === 'tables' || step === 'chairs' ? event : room);
			expect(tools[0]).toBe('select');
			expect(tools[tools.length - 1]).toBe('measure');
		}
	});
	it('offers the room rectangle only where the shell may change', () => {
		expect(toolsFor('room', room)).toContain('bounds');
		expect(toolsFor('room', { ...room, shellEditable: false })).not.toContain('bounds');
	});
	it('hides the table tool when only inventory tables may be placed and there are none', () => {
		expect(toolsFor('tables', { ...event, hasTableTypes: false })).not.toContain('table');
		expect(toolsFor('tables', event)).toContain('table');
		// A hall with no inventory still draws freeform tables.
		expect(toolsFor('tables', { ...room, hasTableTypes: false })).toContain('table');
	});
	it('keeps zones out of the chairs step when zones are locked', () => {
		expect(toolsFor('chairs', { ...event, allowZones: false })).not.toContain('zone');
		expect(toolsFor('chairs', event)).toContain('zone');
	});
	it('leaves the guests and check steps with Select only', () => {
		expect(toolsFor('guests', event)).toEqual(['select']);
		expect(toolsFor('check', event)).toEqual(['select']);
	});
});

describe('shortcuts', () => {
	it('maps every tool to one distinct letter, case-insensitively', () => {
		const letters = Object.values(TOOL_KEYS);
		expect(new Set(letters).size).toBe(letters.length);
		expect(toolForKey('w')).toBe('wall');
		expect(toolForKey('W')).toBe('wall');
		expect(toolForKey('q')).toBeNull();
	});
	it('knows which step a tool lives in', () => {
		expect(stepForTool('zone', stepsFor('event'))).toBe('chairs');
		expect(stepForTool('zone', stepsFor('room'))).toBe('zones');
		expect(stepForTool('table', stepsFor('room'))).toBeNull();
	});
});
