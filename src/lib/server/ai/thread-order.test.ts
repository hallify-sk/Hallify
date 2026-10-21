import { describe, expect, it, vi } from 'vitest';

// The thread loader only reads rows; the OpenAI and tool modules are not needed.
vi.mock('./openai', () => ({ aiConfigured: () => false, createResponse: vi.fn() }));
vi.mock('./tools', () => ({ toolsFor: () => [], runTool: vi.fn() }));

const { loadThreadMessages } = await import('./agent');

type Row = { id: string; role: string | null; display: string | null; proposal_id: string | null;
	p_kind: string | null; p_status: string | null; p_payload: string | null; p_result: string | null };
const row = (id: string, role: string | null, display: string | null, proposal_id: string | null = null): Row => ({
	id, role, display, proposal_id,
	p_kind: proposal_id ? 'hall_profile' : null, p_status: proposal_id ? 'applied' : null, p_payload: null, p_result: null
});
const fakeDb = (rows: Row[]) => ({ prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) }) as never;

describe('loadThreadMessages', () => {
	it('puts a proposal under the reply that explains it', async () => {
		const out = await loadThreadMessages(fakeDb([
			row('u1', 'user', 'Set the opening hours'),
			row('call', null, null, 'p1'),
			row('a1', 'assistant', 'Here are the hours to confirm.'),
		]), 't');
		expect(out.map((m) => [m.id, m.proposal?.id ?? null])).toEqual([['u1', null], ['a1', 'p1']]);
	});

	it('keeps a proposal in its own turn when no reply followed it', async () => {
		const out = await loadThreadMessages(fakeDb([
			row('u1', 'user', 'Set the opening hours'),
			row('a0', 'assistant', 'Sure, drafting it.'),
			row('call', null, null, 'p1'),
			row('u2', 'user', 'What else is missing?'),
			row('a2', 'assistant', 'Pricing and extras next.'),
		]), 't');
		expect(out.map((m) => [m.id, m.proposal?.id ?? null])).toEqual([
			['u1', null], ['a0', null], ['p-p1', 'p1'], ['u2', null], ['a2', null],
		]);
	});

	it('shows a proposal at the end of the thread when the turn is still open', async () => {
		const out = await loadThreadMessages(fakeDb([row('u1', 'user', 'Draw the plan'), row('call', null, null, 'p1')]), 't');
		expect(out.map((m) => m.id)).toEqual(['u1', 'p-p1']);
	});
});
