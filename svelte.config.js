import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter()
	},
	onwarn: (warning, handler) => {
		// suppress non-blocking a11y and reactivity hints during build
		if (warning.code.startsWith('a11y_') || warning.code === 'non_reactive_update' || warning.code === 'state_referenced_locally' || warning.code === 'css_unused_selector') return;
		handler(warning);
	}
};

export default config;
