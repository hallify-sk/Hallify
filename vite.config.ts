import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
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
