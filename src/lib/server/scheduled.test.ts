import { describe, expect, it, vi } from 'vitest';
import { CRON_PATH, cronRequest, withScheduled } from './scheduled';
import type { ExecutionContext } from '@cloudflare/workers-types';

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const controller = { cron: '0 * * * *', scheduledTime: 0 };

describe('cronRequest', () => {
	it('posts to the clean-up route with the secret, on the app origin', () => {
		const req = cronRequest({ CRON_SECRET: 's3cret', APP_URL: 'https://hallify.sk/' })!;
		expect(req.method).toBe('POST');
		expect(req.url).toBe(`https://hallify.sk${CRON_PATH}`);
		expect(req.headers.get('authorization')).toBe('Bearer s3cret');
	});

	it('is null without a secret, and survives a missing or broken APP_URL', () => {
		expect(cronRequest({})).toBeNull();
		expect(cronRequest({ CRON_SECRET: '' })).toBeNull();
		expect(cronRequest({ CRON_SECRET: 'x' })!.url).toBe(`https://localhost${CRON_PATH}`);
		expect(cronRequest({ CRON_SECRET: 'x', APP_URL: 'not a url' })!.url).toBe(`https://localhost${CRON_PATH}`);
	});
});

describe('withScheduled', () => {
	it('passes ordinary requests straight to SvelteKit', async () => {
		const fetch = vi.fn(async () => new Response('page'));
		const worker = withScheduled({ fetch });
		const req = new Request('https://hallify.sk/');
		const res = await worker.fetch(req, {}, ctx);
		expect(await res.text()).toBe('page');
		expect(fetch).toHaveBeenCalledWith(req, {}, ctx);
	});

	it('runs the clean-up through the app on schedule', async () => {
		const fetch = vi.fn(async (_req: Request) => Response.json({ ok: true }));
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		await withScheduled({ fetch }).scheduled(controller, { CRON_SECRET: 'k', APP_URL: 'https://dev.hallify.sk' }, ctx);
		expect(fetch).toHaveBeenCalledTimes(1);
		const sent = fetch.mock.calls[0][0];
		expect(new URL(sent.url).pathname).toBe(CRON_PATH);
		expect(sent.headers.get('authorization')).toBe('Bearer k');
		log.mockRestore();
	});

	it('does nothing but log when CRON_SECRET is missing', async () => {
		const fetch = vi.fn(async () => new Response('x'));
		const err = vi.spyOn(console, 'error').mockImplementation(() => {});
		await withScheduled({ fetch }).scheduled(controller, {}, ctx);
		expect(fetch).not.toHaveBeenCalled();
		expect(err).toHaveBeenCalledWith(expect.stringContaining('CRON_SECRET'));
		err.mockRestore();
	});

	it('fails the invocation when the route refuses', async () => {
		const fetch = vi.fn(async () => new Response('Unauthorized', { status: 401 }));
		await expect(withScheduled({ fetch }).scheduled(controller, { CRON_SECRET: 'wrong' }, ctx)).rejects.toThrow(/401/);
	});
});
