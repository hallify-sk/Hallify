// Bulk import of directory-only venues (/app/platform/listings/import): the parts the
// page and the server share. Nothing here touches the database or the network.
//
// One item of the file:
//   { name, city, country, address, max_people, event_types?: string[], website, phone,
//     email, description_sk, image_official?: { url, page } | string | null,
//     image_credit?: string }
// image_credit names the photo's author when it is not the venue's own (e.g. a
// Wikimedia Commons photo: "Author / CC BY-SA 4.0 / Wikimedia Commons").
// Extra keys are ignored. Each item is turned into the same form fields the single
// "Add venue" form posts, so it is checked by exactly the same rules
// (parseListingVenueForm); this module only maps it and finds duplicates.

import { isPublicHostname, normaliseWebsite } from '$lib/safe-url';
import { csvCell } from '$lib/csvExport';

/** At most this many items per file: about one market's worth, one preview request. */
export const IMPORT_MAX_ITEMS = 500;
/** Items per import request. Each one may fetch a photo (up to 4 requests with its
 *  redirects), geocode, and write a handful of rows: 5 keeps a Worker request well
 *  inside its subrequest limit. */
export const IMPORT_CHUNK = 5;

export interface ImportItem {
	name: string;
	city: string;
	country: string;
	address: string;
	max_people: string;
	event_types: string[];
	website: string;
	phone: string;
	email: string;
	description: string;
	image_url: string | null;
	/** Who to credit for the photo; empty means the venue's own website. */
	image_credit: string;
}

/** A scalar as text; objects, arrays and null are empty, never "[object Object]". */
const scalar = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** One item of the file in a fixed shape, or null when it is not an object at all. */
export function readImportItem(raw: unknown): ImportItem | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const o = raw as Record<string, unknown>;
	const image = o.image_official;
	const imageUrl = typeof image === 'string' ? image.trim()
		: image && typeof image === 'object' ? scalar((image as Record<string, unknown>).url) : '';
	return {
		name: scalar(o.name),
		city: scalar(o.city),
		country: scalar(o.country),
		address: scalar(o.address),
		max_people: scalar(o.max_people),
		event_types: Array.isArray(o.event_types) ? o.event_types.map(scalar).filter(Boolean) : [],
		website: scalar(o.website),
		phone: scalar(o.phone),
		email: scalar(o.email),
		description: scalar(o.description_sk),
		image_url: imageUrl || null,
		image_credit: scalar(o.image_credit).slice(0, 200)
	};
}

/** Lower case, no diacritics, punctuation as single spaces: "Kaštieľ Mošovce, s.r.o." → "kastiel mosovce s r o". */
export function normaliseText(s: string): string {
	return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const contains = (haystack: string, needle: string) => !!needle && ` ${normaliseText(haystack)} `.includes(` ${normaliseText(needle)} `);

/** The address as stored: the item's address with its city, unless it already names it. */
export function importAddress(item: Pick<ImportItem, 'address' | 'city'>): string {
	if (!item.address) return item.city;
	return item.city && !contains(item.address, item.city) ? `${item.address}, ${item.city}` : item.address;
}

const COUNTRY_NAMES: Record<string, string> = { sk: 'Slovensko', svk: 'Slovensko', cz: 'Česko', cze: 'Česko' };

/** What the map lookup is asked: the stored address plus the country, unless it is there already. */
export function importGeocodeQuery(item: Pick<ImportItem, 'address' | 'city' | 'country'>): string {
	const address = importAddress(item);
	const country = COUNTRY_NAMES[item.country.toLowerCase()] ?? item.country;
	return country && !contains(address, country) ? `${address}, ${country}` : address;
}

/** The item as the fields of the "Add venue" form, so the same parser checks it. */
export function importFormData(item: ImportItem): FormData {
	const data = new FormData();
	data.set('name', item.name);
	data.set('address', importAddress(item));
	data.set('max_people', item.max_people);
	data.set('description', item.description);
	data.set('website', item.website);
	data.set('phone', item.phone);
	data.set('email', item.email);
	// Event types become amenities only where a key is the same (the parser keeps
	// built-in amenity keys only); "svadba" or "konferencia" are not amenities.
	for (const e of item.event_types) data.append('amenities', e);
	data.set('is_public', 'on');
	return data;
}

// ─── Duplicates ──────────────────────────────────────────────────────────────

/** Hosts many unrelated venues share as their "website": never a sign of a duplicate. */
const SHARED_HOSTS = new Set([
	'facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'google.com', 'sites.google.com', 'business.site',
	'booking.com', 'tripadvisor.com', 'tripadvisor.sk', 'tripadvisor.cz', 'youtube.com', 'x.com', 'twitter.com',
	'tiktok.com', 'wix.com', 'webnode.sk', 'webnode.cz'
]);

/** A website's host for comparison ("https://WWW.Mlyn.sk/sala" → "mlyn.sk"), or null. */
export function websiteHost(raw: string | null | undefined): string | null {
	const url = normaliseWebsite(raw);
	if (!url) return null;
	const host = new URL(url).hostname.toLowerCase().replace(/^(?:www\d?|m)\./, '');
	return SHARED_HOSTS.has(host) ? null : host;
}

export interface ExistingHall { name: string; org_name?: string | null; address: string | null; website: string | null }
export type Duplicate = { kind: 'website' | 'name_city'; of: string };

/**
 * Venues already in the directory (and those earlier in the same file), to tell
 * whether an item is one of them: the same website host, or the same name in the
 * same city.
 */
export class DuplicateIndex {
	private hosts = new Map<string, string>();
	private names = new Map<string, { label: string; address: string }[]>();

	constructor(rows: ExistingHall[] = []) {
		for (const r of rows) this.add(r);
	}

	add(row: ExistingHall): void {
		const host = websiteHost(row.website);
		if (host && !this.hosts.has(host)) this.hosts.set(host, row.name);
		for (const n of new Set([row.name, row.org_name ?? ''].map(normaliseText).filter(Boolean))) {
			const list = this.names.get(n) ?? [];
			list.push({ label: row.name, address: row.address ?? '' });
			this.names.set(n, list);
		}
	}

	find(item: Pick<ImportItem, 'name' | 'city' | 'website'>): Duplicate | null {
		const host = websiteHost(item.website);
		const byHost = host ? this.hosts.get(host) : undefined;
		if (byHost) return { kind: 'website', of: byHost };
		if (item.city) {
			const same = this.names.get(normaliseText(item.name))?.find((h) => contains(h.address, item.city));
			if (same) return { kind: 'name_city', of: same.label };
		}
		return null;
	}
}

// ─── The photo's address ─────────────────────────────────────────────────────

export type ImageError =
	| 'invalid_url' | 'not_https' | 'private_host' | 'fetch_failed' | 'redirects'
	| 'too_large' | 'not_image' | 'storage';

/** Whether a photo address may be fetched by the server: https on the standard port,
 *  no credentials, a public host name. */
export function checkImageUrl(raw: string): { ok: true; url: URL } | { ok: false; error: ImageError } {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		return { ok: false, error: 'invalid_url' };
	}
	if (u.protocol !== 'https:') return { ok: false, error: 'not_https' };
	if (u.username || u.password || (u.port && u.port !== '443')) return { ok: false, error: 'invalid_url' };
	if (!isPublicHostname(u.hostname)) return { ok: false, error: 'private_host' };
	return { ok: true, url: u };
}

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImportImageType = (typeof IMAGE_TYPES)[number];

/** Whether a fetched body is a photo we keep: declared and actually JPEG, PNG or WebP,
 *  at most 8 MB. `sniffed` is what its first bytes say it is. */
export function checkImageBody(contentType: string, sniffed: string | null, size: number): { ok: true; type: ImportImageType } | { ok: false; error: ImageError } {
	if (size > IMAGE_MAX_BYTES) return { ok: false, error: 'too_large' };
	// The file's own bytes decide, not the server's label: some venue sites send a JPEG
	// as image/png, or a WebP with a garbled Content-Type. It is stored under the type
	// it really is, so a wrong label cannot make it served as something else.
	void contentType;
	const type = IMAGE_TYPES.find((t) => t === sniffed);
	if (!type || size === 0) return { ok: false, error: 'not_image' };
	return { ok: true, type };
}

/** The host a photo comes from, for the preview (the CSP does not let the page show it). */
export function imageHost(raw: string | null): string | null {
	if (!raw) return null;
	try {
		return new URL(raw).hostname;
	} catch {
		return null;
	}
}

// ─── Results ─────────────────────────────────────────────────────────────────

export type PreviewStatus = 'ok' | 'duplicate' | 'invalid';
export interface PreviewRow {
	index: number;
	name: string;
	city: string;
	max_people: string;
	website: string;
	photo_host: string | null;
	status: PreviewStatus;
	/** Why it is a duplicate or invalid, in the admin's language. */
	reason: string | null;
}

export type ImportStatus = 'created' | 'duplicate' | 'failed';
export interface ImportResult {
	index: number;
	name: string;
	status: ImportStatus;
	reason: string | null;
	hall_id: string | null;
	/** null: no photo given; 'ok': stored; otherwise why it was left out. */
	photo: 'ok' | ImageError | null;
	photo_detail?: string | null;
}

/** The import's outcome as CSV, one line per item of the file. Semicolons for a
 *  Slovak reader, whose Excel only splits on those; a BOM so it reads UTF-8. */
export function importResultsCsv(rows: ImportResult[], head: string[], cells: (r: ImportResult) => string[], delimiter: ',' | ';' = ';'): string {
	const lines = [head, ...rows.map(cells)].map((line) => line.map((c) => csvCell(c, delimiter)).join(delimiter));
	return '﻿' + lines.join('\r\n') + '\r\n';
}
