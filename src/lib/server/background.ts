// Work that must outlive the response.
//
// On Cloudflare Workers, a promise still pending when the response has been sent is
// cancelled unless it was handed to ctx.waitUntil(). Notification emails were fired
// with `notifyX(...).catch(() => {})` and never awaited, so in production they were
// dropped (locally, on Node, they finished, which hid the bug).
//
// hooks.server.ts runs every request inside `runInRequestScope`, and the email module
// passes its work through `keepAlive`, so every existing call site is covered without
// changing it. Outside a request (tests, scripts) keepAlive is a no-op.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestScope {
	/** ExecutionContext.waitUntil, when the platform provides one. */
	waitUntil?: (promise: Promise<unknown>) => void;
	/** The request URL: lets background work build absolute links. */
	url?: URL;
	/** The request's locals (read lazily: the locale is set after the scope opens). */
	locals?: Partial<App.Locals>;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
	return storage.run(scope, fn);
}

export function requestScope(): RequestScope | undefined {
	return storage.getStore();
}

/** Keep `promise` alive past the response. Returns the same promise, so callers can
 *  still await it or attach their own catch. A rejection is never left unhandled. */
export function keepAlive<T>(promise: Promise<T>): Promise<T> {
	const waitUntil = storage.getStore()?.waitUntil;
	if (waitUntil) {
		try {
			waitUntil(promise.catch((err) => console.error('[background] task failed:', err)));
		} catch (err) {
			// waitUntil throws once the request has fully finished; nothing to extend.
			console.warn('[background] waitUntil unavailable:', err);
		}
	}
	return promise;
}

/** Wrap an async function so every call is kept alive with keepAlive. */
export function inBackground<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
	return (...args: A) => keepAlive(fn(...args));
}
