import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { isoImport } from 'vite-plugin-iso-import';

export default defineConfig({
	optimizeDeps: {
		exclude: ['@node-rs/argon2']
	},
	build: {
		rollupOptions: {
			external: [/\.node$/, '@node-rs/argon2']
		}
	},
	plugins: [sveltekit(), isoImport()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
