import { describe, expect, it, vi } from 'vitest';
import { inBackground, keepAlive, requestScope, runInRequestScope } from './background';

describe('background work', () => {
	it('hands a fire-and-forget promise to waitUntil inside a request', async () => {
		const waitUntil = vi.fn();
		const notify = inBackground(async (n: number) => n * 2);
		let p!: Promise<number>;
		runInRequestScope({ waitUntil }, () => {
			// The call site does not await, exactly like `notifyX(...).catch(() => {})`.
			p = notify(21);
		});
		expect(waitUntil).toHaveBeenCalledTimes(1);
		expect(await p).toBe(42);
	});

	it('keeps the scope across awaits', async () => {
		const waitUntil = vi.fn();
		await runInRequestScope({ waitUntil, url: new URL('https://hallify.sk/x') }, async () => {
			await Promise.resolve();
			expect(requestScope()?.url?.host).toBe('hallify.sk');
			keepAlive(Promise.resolve(1));
		});
		expect(waitUntil).toHaveBeenCalledTimes(1);
	});

	it('is a no-op outside a request and never leaves a rejection unhandled', async () => {
		await expect(keepAlive(Promise.resolve('ok'))).resolves.toBe('ok');
		const waitUntil = vi.fn();
		const failing = runInRequestScope({ waitUntil }, () => keepAlive(Promise.reject(new Error('boom'))));
		await expect(failing).rejects.toThrow('boom');
		// The copy given to waitUntil is caught.
		await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
	});

	it('survives a waitUntil that throws', async () => {
		const p = runInRequestScope({ waitUntil: () => { throw new Error('finished'); } }, () => keepAlive(Promise.resolve(3)));
		await expect(p).resolves.toBe(3);
	});
});
