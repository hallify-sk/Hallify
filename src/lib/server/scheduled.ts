/** The hourly Cron Trigger (wrangler.toml `[triggers]`), wrapped around SvelteKit's
 *  generated Worker.
 *
 *  adapter-cloudflare only emits a `fetch` handler, so `worker.js` at the repository
 *  root is the Worker's real entry: it re-exports SvelteKit's fetch unchanged (pages,
 *  API routes and static assets keep working exactly as before) and adds `scheduled`.
 *  The scheduled run does not reimplement anything: it calls the app's own
 *  POST /api/cron/cleanup through the wrapped fetch, authenticated with CRON_SECRET,
 *  so the clean-up, reminders and domain checks stay in one place and the route
 *  remains usable by hand.
 *
 *  Imported by `worker.js`, which wrangler bundles outside Vite: this module must not
 *  import `$lib`, `$env` or anything else only SvelteKit can resolve.
 */
import type { ExecutionContext, ScheduledController } from '@cloudflare/workers-types';

export const CRON_PATH = '/api/cron/cleanup';

export interface CronEnv {
	CRON_SECRET?: string;
	APP_URL?: string;
	[binding: string]: unknown;
}

export interface FetchWorker {
	fetch(request: Request, env: CronEnv, ctx: ExecutionContext): Response | Promise<Response>;
}

/** The request a scheduled run sends to the app, or null when CRON_SECRET is not set
 *  (the route then answers 404 by design, so there is nothing to call). */
export function cronRequest(env: CronEnv): Request | null {
	const secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET : '';
	if (!secret) return null;
	let origin = 'https://localhost';
	try {
		if (typeof env.APP_URL === 'string' && env.APP_URL) origin = new URL(env.APP_URL).origin;
	} catch { /* malformed APP_URL: the request never leaves the Worker, any origin will do */ }
	return new Request(`${origin}${CRON_PATH}`, {
		method: 'POST',
		// no-cache keeps the adapter's edge-cache lookup out of the way.
		headers: { authorization: `Bearer ${secret}`, 'cache-control': 'no-cache' },
	});
}

/** SvelteKit's Worker plus a `scheduled` handler that runs the clean-up. */
export function withScheduled<W extends FetchWorker>(app: W) {
	return {
		fetch: (request: Request, env: CronEnv, ctx: ExecutionContext) => app.fetch(request, env, ctx),

		async scheduled(controller: Pick<ScheduledController, 'cron' | 'scheduledTime'>, env: CronEnv, ctx: ExecutionContext): Promise<void> {
			const request = cronRequest(env);
			if (!request) {
				console.error('[cron] CRON_SECRET is not set, so the scheduled clean-up cannot run. Set it with: wrangler secret put CRON_SECRET');
				return;
			}
			const response = await app.fetch(request, env, ctx);
			const body = await response.text().catch(() => '');
			if (!response.ok) {
				// Throwing marks this Cron invocation as failed in the Workers dashboard.
				throw new Error(`[cron] ${controller.cron}: ${CRON_PATH} answered ${response.status} ${body.slice(0, 500)}`);
			}
			console.log(`[cron] ${controller.cron}: ${body.slice(0, 2000)}`);
		},
	};
}
