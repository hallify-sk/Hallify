// Bulk import of directory-only venues: the server half (/app/platform/listings/import).
//
// The page sends the whole file once for a preview (checked here with the same rules
// as the single "Add venue" form, plus the duplicate check), then the ready items in
// chunks of IMPORT_CHUNK, so that no Worker request makes too many subrequests. Every
// chunk is checked again: a second click, a second tab or a re-run after an
// interruption finds the venues already added and skips them as duplicates.

import { dbAll } from '$lib/db/index';
import {
	DuplicateIndex, IMAGE_MAX_BYTES, checkImageBody, checkImageUrl, imageHost, importFormData, importGeocodeQuery,
	readImportItem, type Duplicate, type ExistingHall, type ImageError, type ImportItem, type ImportResult, type PreviewRow
} from '$lib/listing-import';
import { createListingVenue, parseListingVenueForm, type ListingVenueInput } from '$lib/server/listing-venues';
import { fetchPublic } from '$lib/server/web-page';
import { sniffImageType } from '$lib/server/image-sniff';
import { hallWebsite } from '$lib/server/hall-profile';
import { logPlatformAction } from '$lib/server/platform-audit';
import { deleteUnusedHallImages, type R2Deleter } from '$lib/server/hall-images';
import type { sk } from '$lib/i18n';

type Db = App.Locals['db'];
type Strings = (typeof sk)['listings'];
export interface R2Putter { put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown> }
type R2 = R2Putter & R2Deleter;

/** Every hall in the database, listed or not: what an imported venue must not repeat. */
export async function loadDuplicateIndex(db: Db): Promise<DuplicateIndex> {
	const rows = await dbAll<ExistingHall>(db,
		`SELECT h.name, o.name AS org_name, h.address, h.contact_website AS website
		   FROM halls h JOIN organizations o ON o.id = h.org_id`);
	return new DuplicateIndex(rows);
}

const duplicateReason = (d: Duplicate, l: Strings) => (d.kind === 'website' ? l.importDupWebsite(d.of) : l.importDupNameCity(d.of));

type Checked =
	| { status: 'ok'; item: ImportItem; value: ListingVenueInput }
	| { status: 'duplicate' | 'invalid'; item: ImportItem | null; reason: string };

/** One item: readable, valid by the form's rules, and not a venue we already have.
 *  A valid item is added to the index, so a later copy in the same file is a duplicate. */
export function checkImportItem(raw: unknown, index: DuplicateIndex, l: Strings): Checked {
	const item = readImportItem(raw);
	if (!item) return { status: 'invalid', item: null, reason: l.importNotObject };
	const parsed = parseListingVenueForm(importFormData(item), l.errors);
	if (!parsed.ok) return { status: 'invalid', item, reason: parsed.error };
	const dup = index.find(item);
	if (dup) return { status: 'duplicate', item, reason: duplicateReason(dup, l) };
	index.add({ name: parsed.value.name, address: parsed.value.address, website: parsed.value.website });
	return { status: 'ok', item, value: parsed.value };
}

/** The preview of a whole file: one row per item, in the file's order. */
export async function previewImport(db: Db, items: unknown[], l: Strings): Promise<PreviewRow[]> {
	const index = await loadDuplicateIndex(db);
	return items.map((raw, i) => {
		const c = checkImportItem(raw, index, l);
		return {
			index: i,
			name: c.item?.name ?? '',
			city: c.item?.city ?? '',
			max_people: c.item?.max_people ?? '',
			website: c.item?.website ?? '',
			photo_host: imageHost(c.item?.image_url ?? null),
			status: c.status,
			reason: c.status === 'ok' ? null : c.reason
		};
	});
}

/**
 * Copy the venue's photo into our own storage, where an upload goes
 * (halls/<owner>/<time>-<random>.<ext>, served at /uploads/…). https only, a public
 * host, at most 3 redirects, 10 s, 8 MB, and a JPEG, PNG or WebP by both its declared
 * type and its first bytes.
 */
export async function importListingImage(r2: R2Putter | null | undefined, ownerId: string, raw: string):
	Promise<{ ok: true; url: string } | { ok: false; error: ImageError; detail?: string }> {
	const checked = checkImageUrl(raw);
	if (!checked.ok) return checked;
	if (!r2) return { ok: false, error: 'storage' };
	let img;
	try {
		img = await fetchPublic(checked.url.toString(), {
			maxBytes: IMAGE_MAX_BYTES, timeoutMs: 10_000, accept: 'image/jpeg,image/png,image/webp', httpsOnly: true
		});
	} catch {
		return { ok: false, error: 'fetch_failed', detail: 'timeout' };
	}
	if (!img.ok) {
		if (img.reason === 'too large') return { ok: false, error: 'too_large' };
		if (img.reason === 'too many redirects') return { ok: false, error: 'redirects' };
		if (img.reason.includes('not a public')) return { ok: false, error: 'private_host' };
		return { ok: false, error: 'fetch_failed', detail: img.reason };
	}
	const body = checkImageBody(img.contentType, sniffImageType(new Uint8Array(img.body.slice(0, 16))), img.body.byteLength);
	if (!body.ok) return body;
	const ext = body.type.split('/')[1].replace('jpeg', 'jpg');
	const key = `halls/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
	try {
		await r2.put(key, img.body, { httpMetadata: { contentType: body.type } });
	} catch {
		return { ok: false, error: 'storage' };
	}
	return { ok: true, url: `/uploads/${key}` };
}

/** The credit for a photo taken from the venue's website: the site itself, which the
 *  caption shows as its hostname ("Foto: www.example.sk"), linked. */
export function websiteCredit(website: string | null): string | null {
	const url = website ? hallWebsite(website) : null;
	return url ? new URL(url).origin : null;
}

/** Nominatim asks for at most one request a second. */
const GEOCODE_GAP_MS = 1100;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Import one chunk. Each item is checked again (form rules and duplicates), its photo
 * copied if it has one (a photo that fails leaves the venue without one, and says
 * why), then created exactly as the "Add venue" form does, with its audit entry.
 */
export async function importChunk(
	locals: Pick<App.Locals, 'db' | 'user'>,
	r2: R2 | null | undefined,
	entries: { index: number; item: unknown }[],
	l: Strings
): Promise<ImportResult[]> {
	const index = await loadDuplicateIndex(locals.db);
	const ownerId = locals.user?.id ?? 'import';
	const results: ImportResult[] = [];
	let lastCreate = 0;
	for (const { index: i, item: raw } of entries) {
		const c = checkImportItem(raw, index, l);
		const name = c.item?.name ?? '';
		if (c.status !== 'ok') {
			results.push({ index: i, name, status: c.status === 'duplicate' ? 'duplicate' : 'failed', reason: c.reason, hall_id: null, photo: null });
			continue;
		}
		const value: ListingVenueInput = { ...c.value };
		try {
			let photo: ImportResult['photo'] = null;
			let photoDetail: string | null = null;
			if (c.item.image_url) {
				const img = await importListingImage(r2, ownerId, c.item.image_url);
				if (img.ok) {
					photo = 'ok';
					value.cover_image_url = img.url;
					value.cover_image_credit = c.item.image_credit || websiteCredit(value.website) || imageHost(c.item.image_url);
				} else {
					photo = img.error;
					photoDetail = img.detail ?? null;
				}
			}
			const wait = lastCreate + GEOCODE_GAP_MS - Date.now();
			if (wait > 0) await sleep(wait);
			lastCreate = Date.now();
			const { orgId, hallId } = await createListingVenue(locals.db, value, { geocodeQuery: importGeocodeQuery(c.item) });
			await logPlatformAction(locals, 'listing.create', { type: 'org', id: orgId, label: value.name }, { source: 'import', photo: photo === 'ok' });
			results.push({ index: i, name, status: 'created', reason: null, hall_id: hallId, photo, photo_detail: photoDetail });
		} catch (e) {
			console.error('[listing-import] could not create', name, e);
			// A photo stored for a venue that was not created would be public and unused.
			if (value.cover_image_url) await deleteUnusedHallImages(locals.db, r2, [value.cover_image_url]);
			results.push({ index: i, name, status: 'failed', reason: e instanceof Error ? e.message : String(e), hall_id: null, photo: null });
		}
	}
	return results;
}
