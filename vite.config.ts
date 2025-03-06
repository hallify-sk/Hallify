import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { isoImport } from 'vite-plugin-iso-import';

export default defineConfig({
	optimizeDeps: {
		exclude: ['@node-rs/argon2-linux-arm64-musl']
	},
	build: {
		rollupOptions: {
			external: [/\.node$/]
		}
	},
	plugins: [sveltekit(), isoImport()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
