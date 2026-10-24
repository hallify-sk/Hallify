// Directory-only venues: venues that are NOT on Hallify, added by a platform admin so
// the directory covers the market (/app/platform/listings).
//
// Each is an organisation flagged listing_only, with no members and no subscription,
// holding one hall that is booked directly with the venue (booking_mode 'external')
// and public. Being ordinary rows is what keeps the directory, its venue pages, the
// map, search, the sitemap and the listing counters working for them unchanged.
// What is different is handled where it matters: never a partner (PARTNER_SQL), no
// venue site (hooks.server.ts, venueSiteOrigin), not a customer in the platform
// figures. With no members, no member-, billing- or reservation-driven flow (e-mails,
// reminders, cron, Stripe) ever reaches them.

import { dbAll, dbFirst, dbRun, fromJsonArr, toJson } from '$lib/db/index';
import { BUILT_IN_AMENITIES, hallWebsite } from '$lib/server/hall-profile';
import { deleteUnusedHallImages, hallImageUrls, isOwnHallImage, type R2Deleter } from '$lib/server/hall-images';
import { uniqueHallSlug } from '$lib/server/hall-naming';
import { uniqueOrgSlug } from '$lib/server/org-slug';
import { geocodeAddress } from '$lib/server/geocode';
import { validEmail, validPhone } from '$lib/listings';
import type { sk } from '$lib/i18n';

type Db = App.Locals['db'];
type Errors = (typeof sk)['listings']['errors'];

export interface ListingVenueInput {
	name: string;
	address: string;
	max_people: number;
	description: string | null;
	cover_image_url: string | null;
	amenities: string[];
	website: string | null;
	phone: string | null;
	email: string | null;
	is_public: boolean;
}

/** What the form shows back after a refused save: the values as typed. */
export function draftFromForm(data: FormData): Record<string, string | string[] | boolean> {
	const one = (k: string) => String(data.get(k) ?? '').slice(0, 2000);
	return {
		name: one('name'), address: one('address'), max_people: one('max_people'), description: one('description'),
		cover_image_url: one('cover_image_url'), website: one('website'), phone: one('phone'), email: one('email'),
		amenities: data.getAll('amenities').map(String), is_public: data.get('is_public') === 'on'
	};
}

/**
 * Read and check the editor's form. `keepCover` is the venue's current cover, which
 * may stay even if it is not one of our uploads (nothing else is accepted: the CSP
 * only serves images from our own origin).
 */
export function parseListingVenueForm(data: FormData, errors: Errors, keepCover: string | null = null):
	{ ok: true; value: ListingVenueInput } | { ok: false; error: string } {
	const text = (k: string, max: number) => String(data.get(k) ?? '').trim().slice(0, max);
	const name = text('name', 120);
	if (!name) return { ok: false, error: errors.nameRequired };
	const address = text('address', 300);
	if (!address) return { ok: false, error: errors.addressRequired };
	const maxPeople = Number(text('max_people', 10));
	if (!Number.isInteger(maxPeople) || maxPeople < 1 || maxPeople > 100000) return { ok: false, error: errors.capacityInvalid };

	const websiteRaw = text('website', 300);
	const website = websiteRaw ? hallWebsite(websiteRaw) : null;
	if (websiteRaw && !website) return { ok: false, error: errors.invalidWebsite };
	const phone = text('phone', 40) || null;
	if (phone && !validPhone(phone)) return { ok: false, error: errors.invalidPhone };
	const email = text('email', 200) || null;
	if (email && !validEmail(email)) return { ok: false, error: errors.invalidEmail };
	// The listing exists to send visitors to the venue; with no way in it is a dead end.
	if (!website && !phone && !email) return { ok: false, error: errors.contactRequired };

	const cover = text('cover_image_url', 500) || null;
	if (cover && cover !== keepCover && !isOwnHallImage(cover)) return { ok: false, error: errors.coverNotUploaded };

	const allowed = new Set<string>(BUILT_IN_AMENITIES);
	const amenities = [...new Set(data.getAll('amenities').map(String))].filter((a) => allowed.has(a));

	return {
		ok: true,
		value: {
			name, address, max_people: maxPeople,
			description: text('description', 2000) || null,
			cover_image_url: cover, amenities, website, phone, email,
			is_public: data.get('is_public') === 'on'
		}
	};
}

/** The pin for an address, or none when it cannot be found (the hall stays listed
 *  by its address; the map simply leaves it out). */
async function locate(db: Db, address: string): Promise<{ latitude: number | null; longitude: number | null }> {
	try {
		const hit = await geocodeAddress(db, address);
		if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
	} catch {
		/* lookup unavailable */
	}
	return { latitude: null, longitude: null };
}

/** Create the organisation and its one hall. Slugs follow the same rules as any
 *  venue's: transliterated, never a reserved subdomain, never one in use or once used. */
export async function createListingVenue(db: Db, input: ListingVenueInput): Promise<{ orgId: string; hallId: string }> {
	const orgId = crypto.randomUUID();
	const hallId = crypto.randomUUID();
	const orgSlug = await uniqueOrgSlug(db, input.name);
	await dbRun(db, 'INSERT INTO organizations (id, name, slug, listing_only) VALUES (?, ?, ?, 1)', orgId, input.name, orgSlug);
	const hallSlug = await uniqueHallSlug(db, orgId, input.name, null, 'sala');
	const pin = await locate(db, input.address);
	await dbRun(db,
		`INSERT INTO halls (id, org_id, name, slug, description, max_people, address, latitude, longitude,
		                    cover_image_url, amenities, contact_website, contact_phone, contact_email,
		                    booking_mode, allow_reservations, is_public)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'external', 0, ?)`,
		hallId, orgId, input.name, hallSlug, input.description, input.max_people, input.address, pin.latitude, pin.longitude,
		input.cover_image_url, toJson(input.amenities), input.website, input.phone, input.email, input.is_public ? 1 : 0);
	return { orgId, hallId };
}

export interface ListingVenueRow {
	hall_id: string; org_id: string; name: string; org_slug: string; slug: string | null;
	address: string | null; max_people: number; description: string | null; cover_image_url: string | null;
	amenities: string[]; website: string | null; phone: string | null; email: string | null;
	is_public: number; latitude: number | null; longitude: number | null; created_at: string;
}

const SELECT = `SELECT h.id AS hall_id, o.id AS org_id, h.name, o.slug AS org_slug, h.slug, h.address, h.max_people,
       h.description, h.cover_image_url, h.amenities, h.contact_website AS website, h.contact_phone AS phone,
       h.contact_email AS email, h.is_public, h.latitude, h.longitude, o.created_at
  FROM organizations o JOIN halls h ON h.org_id = o.id
 WHERE o.listing_only = 1`;

type RawRow = Omit<ListingVenueRow, 'amenities'> & { amenities: string | null };
const shape = (r: RawRow): ListingVenueRow => ({ ...r, amenities: fromJsonArr(r.amenities).map(String) });

export async function listListingVenues(db: Db): Promise<ListingVenueRow[]> {
	return (await dbAll<RawRow>(db, `${SELECT} ORDER BY h.name`)).map(shape);
}

export async function loadListingVenue(db: Db, hallId: string): Promise<ListingVenueRow | null> {
	const row = await dbFirst<RawRow>(db, `${SELECT} AND h.id = ?`, hallId);
	return row ? shape(row) : null;
}

/** Save the editor's form over a venue. The pin moves only with the address. */
export async function updateListingVenue(db: Db, r2: R2Deleter | null | undefined, current: ListingVenueRow, input: ListingVenueInput): Promise<void> {
	const pin = input.address !== current.address
		? await locate(db, input.address)
		: { latitude: current.latitude, longitude: current.longitude };
	await dbRun(db,
		`UPDATE halls SET name = ?, description = ?, max_people = ?, address = ?, latitude = ?, longitude = ?,
		        cover_image_url = ?, amenities = ?, contact_website = ?, contact_phone = ?, contact_email = ?,
		        booking_mode = 'external', allow_reservations = 0, is_public = ?
		  WHERE id = ? AND org_id = ?`,
		input.name, input.description, input.max_people, input.address, pin.latitude, pin.longitude,
		input.cover_image_url, toJson(input.amenities), input.website, input.phone, input.email, input.is_public ? 1 : 0,
		current.hall_id, current.org_id);
	// The organisation carries the venue's name (the directory shows it above the hall).
	await dbRun(db, 'UPDATE organizations SET name = ? WHERE id = ? AND listing_only = 1', input.name, current.org_id);
	if (current.cover_image_url && current.cover_image_url !== input.cover_image_url) {
		await deleteUnusedHallImages(db, r2, [current.cover_image_url]);
	}
}

/** Remove the venue entirely: the organisation, its hall and its counters (cascade),
 *  and its photo once nothing else shows it. */
export async function deleteListingVenue(db: Db, r2: R2Deleter | null | undefined, current: ListingVenueRow): Promise<void> {
	const photos = hallImageUrls({ cover_image_url: current.cover_image_url });
	await dbRun(db, 'DELETE FROM organizations WHERE id = ? AND listing_only = 1', current.org_id);
	if (photos.length) await deleteUnusedHallImages(db, r2, photos);
}
