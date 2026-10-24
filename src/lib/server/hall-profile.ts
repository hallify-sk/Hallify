import { dbAll, dbFirst, dbRun, fromJson, fromJsonArr, toJson } from '$lib/db/index';
import { geocodeAddress } from '$lib/server/geocode';
import { normaliseWebsite } from '$lib/safe-url';
import { completeOpeningHours, DAY_KEYS, type DayHours } from '$lib/opening-hours';
import { isOwnHallImage } from '$lib/server/hall-images';

export { DAY_KEYS, type DayHours };

/**
 * A hall's public profile — the part the assistant may propose changes to.
 *
 * Content — name, description, capacity, address, contacts, pricing, amenities,
 * hours and photos — can be researched and drafted. Visibility and the public URL
 * stay with a person: getting those wrong is public and immediate. Photos are only
 * ever ones already in our own storage (see importImage), never a remote URL.
 */

/** The ten amenities the app translates itself. Anything else a hall claims must be
 *  one of the organisation's own rows — a client can post any string it likes. */
export const BUILT_IN_AMENITIES = [
	'parking', 'catering', 'av', 'wifi', 'ac',
	'accessible', 'outdoor', 'stage', 'dancefloor', 'bar'
] as const;

export interface HallPatch {
	name?: string;
	description?: string;
	max_people?: number;
	address?: string;
	pricing_info?: string;
	price_band?: 1 | 2 | 3;
	contact_phone?: string;
	contact_email?: string;
	contact_website?: string;
	amenities?: string[];
	opening_hours?: Record<string, DayHours>;
	cover_image_url?: string;
	gallery_images?: string[];
}

export type HallField = keyof HallPatch;
export const HALL_FIELDS: HallField[] = [
	'name', 'description', 'max_people', 'address', 'pricing_info', 'price_band',
	'contact_phone', 'contact_email', 'contact_website', 'amenities', 'opening_hours',
	'cover_image_url', 'gallery_images'
];

type Db = App.Locals['db'];

/** Amenity keys this organisation may use: the built-ins plus its own. */
export async function allowedAmenityKeys(db: Db, orgId: string): Promise<string[]> {
	let own: string[] = [];
	try {
		own = (await dbAll<{ slug: string }>(db, 'SELECT slug FROM org_amenities WHERE org_id = ?', orgId)).map((r) => r.slug);
	} catch {
		/* table arrives with 0006 */
	}
	return [...BUILT_IN_AMENITIES, ...own];
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A venue's website as typed ("www.reduta.sk", "https://reduta.sk/sala"), as an
 * http(s) URL a page may link to, or null. Anything else — javascript:, data:, an
 * internal address — is refused: the venue site renders it as a link (B14).
 */
export function hallWebsite(raw: unknown): string | null {
	const url = normaliseWebsite(String(raw ?? '').trim().slice(0, 300));
	if (!url) return null;
	const u = new URL(url);
	// "https://reduta.sk/" reads as "https://reduta.sk"; a path, query or hash stays.
	return u.pathname === '/' && !u.search && !u.hash ? url.replace(/\/$/, '') : url;
}

/**
 * Check a proposed patch with the same rules the hall form applies, and normalise
 * it. Fields that are absent stay as they are; nothing here clears a field.
 */
export async function validateHallPatch(
	db: Db,
	orgId: string,
	raw: Record<string, unknown>,
	opts: { maxGallery?: number } = {}
): Promise<{ ok: true; patch: HallPatch } | { ok: false; error: string }> {
	const patch: HallPatch = {};
	const text = (k: string, max: number) => {
		const v = raw[k];
		return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
	};

	const name = text('name', 120);
	if (name !== undefined) patch.name = name;
	const description = text('description', 4000);
	if (description !== undefined) patch.description = description;
	const address = text('address', 300);
	if (address !== undefined) patch.address = address;
	const pricing = text('pricing_info', 2000);
	if (pricing !== undefined) patch.pricing_info = pricing;

	if (raw.max_people != null) {
		const n = Number(raw.max_people);
		if (!Number.isInteger(n) || n < 1 || n > 100000) return { ok: false, error: 'Capacity must be a whole number of at least 1.' };
		patch.max_people = n;
	}
	if (raw.price_band != null) {
		const b = Number(raw.price_band);
		if (b !== 1 && b !== 2 && b !== 3) return { ok: false, error: 'Price band must be 1, 2 or 3.' };
		patch.price_band = b;
	}

	const phone = text('contact_phone', 40);
	if (phone !== undefined) {
		if (!/^[+0-9 ()/.-]{6,40}$/.test(phone)) return { ok: false, error: 'That phone number does not look valid.' };
		patch.contact_phone = phone;
	}
	const email = text('contact_email', 200);
	if (email !== undefined) {
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'That email address does not look valid.' };
		patch.contact_email = email;
	}
	const site = text('contact_website', 300);
	if (site !== undefined) {
		const url = hallWebsite(site);
		if (!url) return { ok: false, error: 'That website address does not look valid.' };
		patch.contact_website = url;
	}

	if (Array.isArray(raw.amenities)) {
		const allowed = new Set(await allowedAmenityKeys(db, orgId));
		patch.amenities = [...new Set(raw.amenities.map(String))].filter((a) => allowed.has(a));
	}

	if (Array.isArray(raw.opening_hours)) {
		const hours: Record<string, DayHours> = {};
		for (const d of raw.opening_hours as { day?: unknown; open?: unknown; from?: unknown; to?: unknown }[]) {
			const day = String(d.day ?? '');
			if (!(DAY_KEYS as readonly string[]).includes(day)) continue;
			const open = d.open === true;
			const from = String(d.from ?? '');
			const to = String(d.to ?? '');
			if (open && (!TIME.test(from) || !TIME.test(to))) return { ok: false, error: `Opening hours for ${day} need times as HH:MM.` };
			hours[day] = { open, from: open ? from : '09:00', to: open ? to : '22:00' };
		}
		if (Object.keys(hours).length) patch.opening_hours = hours;
	}

	if (typeof raw.cover_image_url === 'string' && raw.cover_image_url) {
		if (!isOwnHallImage(raw.cover_image_url)) return { ok: false, error: 'The cover photo must be imported first.' };
		patch.cover_image_url = raw.cover_image_url;
	}
	if (Array.isArray(raw.gallery_images)) {
		const gallery = [...new Set(raw.gallery_images.map(String))];
		if (gallery.some((u) => !isOwnHallImage(u))) return { ok: false, error: 'Gallery photos must be imported first.' };
		const max = opts.maxGallery ?? -1;
		if (max !== -1 && gallery.length > max) return { ok: false, error: `The plan allows up to ${max} gallery photos.` };
		patch.gallery_images = gallery;
	}

	return { ok: true, patch };
}

export interface HallProfileRow {
	id: string; name: string; description: string | null; max_people: number; address: string | null;
	pricing_info: string | null; price_band: number | null; contact_phone: string | null; contact_email: string | null;
	contact_website: string | null; amenities: string | null; opening_hours: string | null;
	cover_image_url: string | null; gallery_images: string | null;
	latitude: number | null; longitude: number | null; is_public: number; archived_at: string | null;
}

export async function loadHallProfile(db: Db, orgId: string, hallId: string): Promise<HallProfileRow | null> {
	return dbFirst<HallProfileRow>(db,
		`SELECT id, name, description, max_people, address, pricing_info, price_band, contact_phone, contact_email,
		        contact_website, amenities, opening_hours, cover_image_url, gallery_images,
		        latitude, longitude, is_public, archived_at
		   FROM halls WHERE id = ? AND org_id = ?`, hallId, orgId);
}

/** A field's value as stored, in the same shape a patch carries it. */
export function currentValue(hall: HallProfileRow, field: HallField): unknown {
	if (field === 'amenities') return fromJsonArr(hall.amenities).map(String);
	if (field === 'gallery_images') return fromJsonArr(hall.gallery_images).map(String);
	if (field === 'opening_hours') return fromJson<Record<string, DayHours>>(hall.opening_hours) ?? {};
	return hall[field] ?? null;
}

/** Metres between two coordinates (haversine; plenty for "same place or not"). */
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const R = 6_371_000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/** Beyond this the old pin marks a different place, not a more precise spot. */
export const PIN_FOLLOWS_ADDRESS_M = 1000;

/**
 * Write a validated patch. The address and the map pin follow each other:
 *   - no pin yet: the new address places one;
 *   - a pin within a kilometre of the new address: kept — it was placed by hand,
 *     more precisely than any geocoder (a postcode added to the address moves nothing);
 *   - a pin further away: it marked the OLD place, so it moves to the new address.
 * If the address cannot be found, the pin is left alone.
 */
export async function applyHallPatch(db: Db, orgId: string, hall: HallProfileRow, patch: HallPatch): Promise<void> {
	const sets: string[] = [];
	const params: unknown[] = [];
	for (const field of HALL_FIELDS) {
		if (!(field in patch)) continue;
		// A patch may name only some days; the row always holds all seven (B74).
		const v = field === 'opening_hours'
			? completeOpeningHours({ ...(fromJson<Record<string, DayHours>>(hall.opening_hours) ?? {}), ...patch.opening_hours })
			: patch[field];
		sets.push(`${field} = ?`);
		params.push(field === 'amenities' || field === 'opening_hours' || field === 'gallery_images' ? toJson(v) : v);
	}
	if (patch.address && patch.address !== hall.address) {
		try {
			const hit = await geocodeAddress(db, patch.address);
			const hasPin = hall.latitude != null && hall.longitude != null;
			if (hit && (!hasPin || distanceM(hall.latitude!, hall.longitude!, hit.latitude, hit.longitude) > PIN_FOLLOWS_ADDRESS_M)) {
				sets.push('latitude = ?', 'longitude = ?');
				params.push(hit.latitude, hit.longitude);
			}
		} catch {
			/* lookup unavailable: keep the pin rather than fail the save */
		}
	}
	if (!sets.length) return;
	await dbRun(db, `UPDATE halls SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params, hall.id, orgId);
}

// ─── Saving the profile form over the version it was loaded from ────────────

/** The columns the hall page's profile form writes. A save from a page loaded
 *  before someone else saved any of them is a conflict (B111); booking rules, the
 *  floor plan and the base price are saved separately and do not count. */
export const PROFILE_COLUMNS = [
	'name', 'max_people', 'color', 'description', 'address', 'latitude', 'longitude',
	'is_public', 'slug', 'cover_image_url', 'gallery_images', 'amenities', 'pricing_info',
	'price_band', 'contact_phone', 'contact_email', 'contact_website', 'opening_hours'
] as const;
export type ProfileColumn = (typeof PROFILE_COLUMNS)[number];
export type ProfileColumns = Partial<Record<ProfileColumn, unknown>>;

/** A short fingerprint of the profile as stored, for the form to send back. */
export async function hallProfileVersion(row: ProfileColumns): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(PROFILE_COLUMNS.map((c) => row[c] ?? null)));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** "AND name IS ? AND …": an UPDATE's guard that the profile is still exactly the
 *  row that was read, so a save that raced another one writes nothing. */
export function profileUnchangedGuard(row: ProfileColumns): { sql: string; params: unknown[] } {
	return {
		sql: PROFILE_COLUMNS.map((c) => ` AND ${c} IS ?`).join(''),
		params: PROFILE_COLUMNS.map((c) => row[c] ?? null)
	};
}
