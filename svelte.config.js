import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// SvelteKit generates the hashes for its own inline bootstrap script, so the
		// policy can stay strict without breaking hydration. Kept here rather than in
		// hooks for that reason. 'unsafe-inline' is required for style-src only:
		// components ship scoped <style> blocks and the layout sets inline `style=`
		// attributes for per-org branding colours.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:'],
				'font-src': ['self', 'data:'],
				'connect-src': ['self'],
				'form-action': ['self'],
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
