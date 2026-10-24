import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { requireOrgArea } from '$lib/server/access';
import { safeFileName } from '$lib/server/floorplan-mapping';
import type { RequestHandler } from './$types';

/**
 * The floor plan Hallify delivered for a mapping request (M25), for the members of
 * the hall's own organisation who may open the hall. It is kept in private storage,
 * never under /uploads, so this is the only way to it.
 */
export const GET: RequestHandler = async ({ params, locals, url, platform }) => {
	const { org } = await requireOrgArea(locals, 'halls');
	const row = await dbFirst<{ delivery_file_key: string | null; delivery_file_name: string | null; delivery_file_type: string | null }>(locals.db,
		`SELECT fr.delivery_file_key, fr.delivery_file_name, fr.delivery_file_type
		   FROM floorplan_requests fr JOIN halls h ON h.id = fr.hall_id
		  WHERE fr.id = ? AND fr.hall_id = ? AND h.org_id = ? AND fr.org_id = ?`,
		url.searchParams.get('request') ?? '', params.id, org.id, org.id);
	if (!row?.delivery_file_key) error(404, 'Not found');

	const obj = await platform?.env?.R2?.get(row.delivery_file_key);
	if (!obj || !obj.body) error(404, 'Not found');

	const name = row.delivery_file_name ?? 'podorys';
	return new Response(obj.body as unknown as BodyInit, {
		headers: {
			'content-type': row.delivery_file_type ?? obj.httpMetadata?.contentType ?? 'application/octet-stream',
			// The ASCII name for old clients, the real one (with diacritics) for the rest.
			'content-disposition': `attachment; filename="${safeFileName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`,
			'cache-control': 'private, no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
