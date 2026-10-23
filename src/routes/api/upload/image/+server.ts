import { json, error } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { sniffImageType } from '$lib/server/image-sniff';
import { st } from '$lib/i18n-server';
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
		error(429, st(event.locals.locale).imageDialog.tooManyUploads(rl.retryAfterMinutes));
	}

	const r2 = event.platform!.env.R2;
	if (!r2) {
		error(503, st(event.locals.locale).imageDialog.uploadUnavailable);
	}

	const formData = await event.request.formData();
	const file = formData.get('file');

	if (!(file instanceof File)) error(400, st(event.locals.locale).imageDialog.noFile);
	if (!ALLOWED_TYPES.includes(file.type)) error(400, st(event.locals.locale).imageDialog.onlyImageTypes);
	if (file.size > MAX_SIZE) error(400, st(event.locals.locale).imageDialog.fileTooLarge(MAX_SIZE / 1024 / 1024));

	// The declared type is only the browser's (or a script's) word for it. What is
	// stored, and the Content-Type it is served with, come from the bytes.
	const bytes = await file.arrayBuffer();
	const actual = sniffImageType(new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 16)));
	if (!actual) error(400, st(event.locals.locale).imageDialog.notAnImage);

	const ext = actual.split('/')[1].replace('jpeg', 'jpg');
	const key = `halls/${event.locals.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

	try {
		await r2.put(key, bytes, { httpMetadata: { contentType: actual } });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		error(502, `Storage error: ${msg}`);
	}

	// Same-origin URL served by /uploads/[...key] — works on localhost, prod, and
	// any SaaS custom hostname without a public bucket.
	const url = `/uploads/${key}`;
	return json({ url });
};
