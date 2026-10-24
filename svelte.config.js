import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// The form-CSRF origin check runs in hooks.server.ts (formCsrfRefused in
		// $lib/server/mcp/http) instead, with the same rule, so that the OAuth token
		// and revocation endpoints — POSTed form bodies from agents' servers, which
		// carry no Origin and no cookie — can be exempted from it. Every other path is
		// still refused a cross-site form post.
		csrf: { trustedOrigins: ['*'] },
		// SvelteKit generates the hashes for its own inline bootstrap script, so the
		// policy can stay strict without breaking hydration. Kept here rather than in
		// hooks for that reason. 'unsafe-inline' is required for style-src only:
		// components ship scoped <style> blocks and the layout sets inline `style=`
		// attributes for per-org branding colours.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// GTM is loaded from Google only AFTER consent (see $lib/analytics).
				// 'unsafe-inline' is required because GTM injects inline tag snippets it
				// generates itself; there is no nonce-compatible mode for arbitrary tags.
				// Our own scripts remain covered by 'self'.
				'script-src': ['self', 'unsafe-inline', 'https://www.googletagmanager.com'],
				'style-src': ['self', 'unsafe-inline'],
				// GA4/Ads pixels are delivered as images.
				'img-src': ['self', 'data:', 'blob:', 'https://tile.openstreetmap.org', 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com'],
				'font-src': ['self', 'data:'],
				// Measurement beacons.
				'connect-src': ['self', 'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
				// Stripe Checkout and the billing portal are reached by a 303 from our own
				// form actions. The billing forms are enhanced (a script navigation, which
				// form-action does not govern), but without JavaScript the browser follows the
				// redirect as part of the form submission, and Chrome checks it against this
				// list. Exactly these two hosts; nothing else may receive a form.
				'form-action': ['self', 'https://checkout.stripe.com', 'https://billing.stripe.com'],
				'base-uri': ['self'],
				'object-src': ['none'],
				'frame-ancestors': ['none']
			}
		}
	},
	onwarn: (warning, handler) => {
		// suppress non-blocking a11y and reactivity hints during build
		if (warning.code.startsWith('a11y_') || warning.code === 'non_reactive_update' || warning.code === 'state_referenced_locally' || warning.code === 'css_unused_selector') return;
		handler(warning);
	}
};

export default config;
