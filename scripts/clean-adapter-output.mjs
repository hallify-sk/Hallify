import { rmSync, existsSync } from 'node:fs';

/**
 * Remove .svelte-kit/cloudflare before a build.
 *
 * adapter-cloudflare does this itself at the start of adapt(), but on Windows the
 * delete intermittently throws EPERM against a directory the previous build just
 * wrote — failing the build AFTER vite has already succeeded, and taking
 * deploy:prod down with it. Doing it here first sidesteps the adapter's own delete.
 *
 * Windows releases handles lazily, so a transient lock is usually gone within a few
 * hundred milliseconds; we retry rather than give up on the first throw. A lock that
 * survives every attempt is not transient — it means something is actively serving
 * this directory, which in practice is a running `wrangler dev`. No build can
 * succeed until that stops, so say so plainly rather than failing with a bare errno
 * stack that gives the reader nothing to act on.
 */
const TARGET = '.svelte-kit/cloudflare';
const ATTEMPTS = 6;
const BACKOFF_MS = 250;

if (existsSync(TARGET)) {
	let lastError;

	for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
		try {
			rmSync(TARGET, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 });
			lastError = undefined;
			break;
		} catch (error) {
			lastError = error;
			// This runs before the build, outside any event loop, so there is nothing
			// to await — a short spin is the simplest correct backoff here.
			const until = Date.now() + BACKOFF_MS;
			while (Date.now() < until) {
				/* back off */
			}
		}
	}

	if (lastError) {
		console.error(
			`\nCannot clear ${TARGET} — it is locked by another process.\n` +
				'A running `wrangler dev` serves from this directory; stop it and build again.\n'
		);
		process.exit(1);
	}
}
