import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	// Svelte component packages must be compiled with the app, not pre-bundled: the
	// optimizer would give them a private copy of Svelte's runtime, whose DOM helpers
	// are never initialised ("next_sibling_getter.call" is undefined at mount).
	optimizeDeps: { exclude: ['@tabler/icons-svelte'] },
	ssr: { noExternal: ['@tabler/icons-svelte'] },
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		globals: true,
		coverage: {
			provider: 'v8',
			include: ['src/lib/stripe.ts', 'src/routes/api/upload/image/+server.ts'],
		},
	},
});
