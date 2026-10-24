// How a hall is booked, and what a directory listing is: shared by the server, the
// directory, the venue site's hall page and the console.
//
// A hall either takes bookings through Hallify (the booking form on the venue's site,
// as every hall always did) or sends visitors to the venue directly: its own website,
// phone or e-mail. The second is for venues that are not on Hallify at all (a
// directory-only listing a platform admin added, organizations.listing_only) and for
// Hallify venues that keep taking bookings their own way.

import { safeHref } from '$lib/safe-url';

export type BookingMode = 'hallify' | 'external';
export const BOOKING_MODES: readonly BookingMode[] = ['hallify', 'external'];

/** A posted or stored mode; anything unrecognised is today's behaviour. */
export function parseBookingMode(raw: unknown): BookingMode {
	return raw === 'external' ? 'external' : 'hallify';
}

/**
 * Whether Hallify offers this hall's booking form. An external hall never does,
 * whatever allow_reservations says (migration 0041 also keeps that column at 0 for
 * them, so SQL filtered on it agrees); a Hallify hall does while it is open.
 */
export function takesHallifyBookings(hall: { allow_reservations: number | boolean | null | undefined; booking_mode?: string | null }): boolean {
	return !!hall.allow_reservations && parseBookingMode(hall.booking_mode) === 'hallify';
}

/**
 * The three kinds of directory listing, as GA4's listing_type and the platform
 * report name them:
 *   partner  — a Hallify partner (paid plan or flagged by hand);
 *   basic    — any other venue on Hallify;
 *   external — a directory-only venue that is not on Hallify.
 */
export type ListingType = 'partner' | 'basic' | 'external';

export function listingType(row: { listing_only?: number | boolean | null; is_partner?: number | boolean | null }): ListingType {
	if (row.listing_only) return 'external';
	return row.is_partner ? 'partner' : 'basic';
}

// ─── Contact links ───────────────────────────────────────────────────────────

const PHONE = /^[+0-9 ()/.-]{6,40}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validPhone(raw: unknown): boolean {
	return typeof raw === 'string' && PHONE.test(raw.trim()) && /\d{6}/.test(raw.replace(/\D/g, ''));
}

export function validEmail(raw: unknown): boolean {
	return typeof raw === 'string' && raw.trim().length <= 200 && EMAIL.test(raw.trim());
}

/** A tel: link that dials, whatever spaces or slashes the number was typed with. */
export function telHref(phone: string): string {
	return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function mailHref(email: string): string {
	return `mailto:${email.trim()}`;
}

export interface ExternalContact {
	/** An http(s) URL safe to link to, or null. */
	website: string | null;
	phone: string | null;
	email: string | null;
}

/** The venue's own ways in, each only when it is usable as a link. */
export function externalContact(hall: { contact_website?: string | null; contact_phone?: string | null; contact_email?: string | null }): ExternalContact {
	return {
		website: safeHref(hall.contact_website),
		// The phone is shown as typed (the console has never checked its format); only
		// its digits go into the tel: link.
		phone: hall.contact_phone?.trim() || null,
		email: hall.contact_email && validEmail(hall.contact_email) ? hall.contact_email.trim() : null
	};
}

export function hasExternalContact(c: ExternalContact): boolean {
	return !!(c.website || c.phone || c.email);
}

// ─── Counted events ──────────────────────────────────────────────────────────

/** What the first-party counters record (POST /api/listing-events). */
export const LISTING_EVENT_TYPES = ['impression', 'detail_view', 'website_click', 'phone_click', 'email_click'] as const;
export type ListingEventType = (typeof LISTING_EVENT_TYPES)[number];
export type ClickType = 'website' | 'phone' | 'email';

/** Which listing a counted event is about: the id for our counter, the rest for GA4. */
export interface ListingRef {
	hall_id: string;
	/** The hall's slug: GA4's item_id. */
	slug: string | null;
	/** The organisation's id: GA4's venue_id. */
	venue_id: string | null;
	listing_type: ListingType;
}
