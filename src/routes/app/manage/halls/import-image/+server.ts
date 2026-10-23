import { json, error } from '@sveltejs/kit';
import { rateLimit, rateLimitKey, RATE_LIMITS } from '$lib/rateLimit';
import { requireOrgPermission } from '$lib/server/access';
import { importImage } from '$lib/server/web-page';
import { isOwnHallImage } from '$lib/server/hall-images';
import { st } from '$lib/i18n-server';
import type { RequestHandler } from './$types';

/**
 * A photo address pasted into the hall image dialog, copied into our own storage.
 *
 * The dialog used to store any URL as it was. The site's CSP serves images from its
 * own origin only, so a cover pasted from another site (a Google redirect, say)
 * showed visitors a broken image (B62). Now the picture is fetched once, checked to
 * really be a photo, and stored exactly where an upload goes; the dialog gets back
 * our own URL. One of our own URLs is returned unchanged.
 */
export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) error(401, 'Unauthorized');
	await requireOrgPermission(locals, 'halls.manage');
	const e = st(locals.locale).imageDialog;

	let raw = '';
	try {
		raw = String(((await request.json()) as { url?: unknown })?.url ?? '').trim();
	} catch {
		error(400, e.invalidUrl);
	}
	if (isOwnHallImage(raw)) return json({ url: raw });
	if (!/^https?:\/\/\S+$/i.test(raw)) error(400, e.invalidUrl);

	// Same quota as uploads: this writes to the same storage.
	const rl = await rateLimit(locals.db, rateLimitKey('upload', locals.user.id), RATE_LIMITS.upload);
	if (!rl.ok) error(429, e.uploadFailed);

	const r2 = platform?.env?.R2;
	if (!r2) error(503, e.uploadFailed);

	let url: string | null = null;
	try {
		url = await importImage(r2, locals.user.id, raw);
	} catch {
		url = null;
	}
	if (!url) error(422, e.importFailed);
	return json({ url });
};
