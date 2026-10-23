import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
// The real deserialize needs the client app's decoders; the shape is what matters here.
vi.mock('$app/forms', () => ({
	deserialize: (text: string) => {
		const parsed = JSON.parse(text);
		if (parsed.data) parsed.data = JSON.parse(parsed.data);
		return parsed;
	}
}));

import { LayoutSaver } from './layout-saver.svelte';

const ok = () => new Response(JSON.stringify({ type: 'success', status: 200 }));
const refused = (error: string) => new Response(JSON.stringify({ type: 'failure', status: 400, data: JSON.stringify({ error }) }));

describe('LayoutSaver', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		vi.useFakeTimers();
		fetchMock = vi.fn(async () => ok());
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	const make = (autosave = () => true) =>
		new LayoutSaver({ action: '?/saveLayout', field: 'layoutJson', autosave, failedMessage: () => 'failed' });

	it('takes the editor\'s first report as where it started, not as an edit', async () => {
		const s = make();
		s.change('{"a":1}');
		expect(s.dirty).toBe(false);
		expect(s.state).toBe('idle');
		await vi.runAllTimersAsync();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('autosaves an edit after the delay, and is then saved', async () => {
		const s = make();
		s.change('{"a":1}');
		s.change('{"a":2}');
		expect(s.state).toBe('dirty');
		await vi.runAllTimersAsync();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = fetchMock.mock.calls[0][1].body as FormData;
		expect(body.get('layoutJson')).toBe('{"a":2}');
		expect(s.state).toBe('saved');
	});

	it('never autosaves while saving is the user\'s call, but saves on request', async () => {
		let auto = false;
		const s = make(() => auto);
		s.change('{"a":1}');
		s.change('{"a":2}');
		await vi.runAllTimersAsync();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(await s.save({ force: true })).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		auto = true;
	});

	it('keeps the edit unsaved and says why when the server refuses it', async () => {
		fetchMock.mockImplementation(async () => refused('Too many tables'));
		const s = make();
		s.change('{"a":1}');
		s.change('{"a":2}');
		await vi.runAllTimersAsync();
		expect(s.error).toBe('Too many tables');
		expect(s.dirty).toBe(true);
	});

	it('saves what a rebuilt editor shows when told it differs from the server', async () => {
		const s = make();
		s.change('{"a":1}');
		s.reset({ dirty: true });
		s.change('{"a":1}');
		expect(s.dirty).toBe(true);
		await vi.runAllTimersAsync();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(s.dirty).toBe(false);
	});
});
