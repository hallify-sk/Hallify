import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || !locals.user.is_platform_admin) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const timestamp = Date.now();

	// Cloudflare Workers does not expose process.cpuUsage() or os module.
	// Return placeholder values for CPU; memory is also unavailable in Workers.
	return json({
		cpu: null,
		memory: null,
		timestamp,
	});
};
