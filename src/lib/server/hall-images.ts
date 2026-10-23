import { dbAll, dbFirst, fromJsonArr } from '$lib/db/index';

/**
 * Hall photos in our own storage (R2, served at /uploads/halls/…).
 *
 * A photo is public for as long as its object exists, so a photo the venue removed,
 * or one of a deleted hall, has to go from storage too, not only from the row (B152).
 * One object can be shared — the same upload pasted into two halls, or sent as a
 * message attachment — so it is deleted only when nothing references it any more.
 */

type Db = App.Locals['db'];
export interface R2Deleter { delete(key: string | string[]): Promise<unknown> }

/** Our own uploaded photo: what the upload endpoint and importImage produce. */
export const OWN_HALL_IMAGE = /^\/uploads\/(halls\/[\w-]+\/[\w.-]+\.(?:jpg|jpeg|png|webp|gif))$/;

export function isOwnHallImage(url: unknown): boolean {
	return typeof url === 'string' && OWN_HALL_IMAGE.test(url);
}

/** The R2 key behind one of our photo URLs, or null for anything else. */
export function hallImageKey(url: unknown): string | null {
	const m = typeof url === 'string' ? OWN_HALL_IMAGE.exec(url) : null;
	return m ? m[1] : null;
}

/** Every photo URL a hall row points at (cover first, then the gallery). */
export function hallImageUrls(row: { cover_image_url?: string | null; gallery_images?: string | null } | null | undefined): string[] {
	if (!row) return [];
	const urls = [row.cover_image_url ?? '', ...fromJsonArr(row.gallery_images).map(String)];
	return [...new Set(urls.filter(Boolean))];
}

/** Whether anything in the database still shows this URL. */
async function stillReferenced(db: Db, url: string): Promise<boolean> {
	const hall = await dbFirst<{ ok: number }>(db,
		`SELECT 1 AS ok FROM halls h
		  WHERE h.cover_image_url = ?
		     OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(h.gallery_images) THEN h.gallery_images ELSE '[]' END) j
		                 WHERE j.value = ?)
		  LIMIT 1`, url, url);
	if (hall) return true;
	// Message attachments and organisation branding use the same upload endpoint.
	for (const sql of [
		'SELECT 1 AS ok FROM messages WHERE attachment_url = ? LIMIT 1',
		'SELECT 1 AS ok FROM organizations WHERE logo_url = ? LIMIT 1',
		'SELECT 1 AS ok FROM org_settings WHERE instr(value, ?) > 0 LIMIT 1'
	]) {
		try {
			if (await dbFirst<{ ok: number }>(db, sql, url)) return true;
		} catch {
			// A table this database does not have cannot reference the photo.
		}
	}
	return false;
}

/**
 * Delete from storage the photos among `urls` that nothing references any more.
 * Call it after the rows have been changed. Never throws: a storage hiccup must not
 * fail the save or the delete that triggered it. Returns how many were deleted.
 */
export async function deleteUnusedHallImages(db: Db, r2: R2Deleter | null | undefined, urls: string[]): Promise<number> {
	if (!r2) return 0;
	let deleted = 0;
	for (const url of [...new Set(urls)]) {
		const key = hallImageKey(url);
		if (!key) continue;
		try {
			if (await stillReferenced(db, url)) continue;
			await r2.delete(key);
			deleted++;
		} catch {
			/* left in storage; harmless beyond the bytes */
		}
	}
	return deleted;
}

/**
 * Every photo of an organisation's halls, for whoever deletes the organisation:
 * collect them before the rows go, then pass them to deleteUnusedHallImages after.
 */
export async function orgHallImageUrls(db: Db, orgId: string): Promise<string[]> {
	const rows = await dbAll<{ cover_image_url: string | null; gallery_images: string | null }>(db,
		'SELECT cover_image_url, gallery_images FROM halls WHERE org_id = ?', orgId);
	return [...new Set(rows.flatMap(hallImageUrls))];
}
