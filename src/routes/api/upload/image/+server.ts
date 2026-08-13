import { json, error } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Unauthorized');

	// Per-user, not per-IP: uploads require a session, and a shared office IP
	// shouldn't make colleagues compete for the same quota.
	const rl = await rateLimit(
		event.locals.db,
		rateLimitKey('upload', event.locals.user.id),
		RATE_LIMITS.upload
	);
	if (!rl.ok) {
		error(429, `Too many uploads. Try again in ${rl.retryAfterMinutes} min.`);
	}

	const r2 = event.platform!.env.R2;
	if (!r2) {
		error(503, 'Image upload is not configured. R2 binding is missing.');
	}

	const formData = await event.request.formData();
	const file = formData.get('file');

	if (!(file instanceof File)) error(400, 'No file provided.');
	if (!ALLOWED_TYPES.includes(file.type)) error(400, 'Only JPEG, PNG, WebP, and GIF images are allowed.');
	if (file.size > MAX_SIZE) error(400, 'File exceeds 8 MB limit.');

	const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
	const key = `halls/${event.locals.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

	try {
		await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(502, `Storage error: ${msg}`);
	}

	// Same-origin URL served by /uploads/[...key] — works on localhost, prod, and
	// any SaaS custom hostname without a public bucket.
	const url = `/uploads/${key}`;
	return json({ url });
};
