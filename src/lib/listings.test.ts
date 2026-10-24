import { describe, expect, it } from 'vitest';
import {
	externalContact, hasExternalContact, listingType, mailHref, parseBookingMode, takesHallifyBookings, telHref, validEmail, validPhone
} from './listings';
import { bookingHref, venueListingRef, type PublicVenue } from './marketing/types';
import { filterVenues } from './marketing/discovery';

const venue = (over: Partial<PublicVenue> = {}): PublicVenue => ({
	id: 'h1', name: 'Reduta', slug: 'velka-sala', description: null, address: 'Košice', max_people: 100,
	latitude: null, longitude: null, cover_image_url: null, amenities: [], pricing_info: null, price_band: null,
	allow_reservations: 1, has_floorplan: 0, is_partner: false, org_slug: 'reduta', site_url: 'https://reduta.hallify.sk',
	org_id: 'o1', booking_mode: 'hallify', listing_type: 'basic', contact: null, ...over
});

describe('booking mode', () => {
	it('reads anything unknown as Hallify, today\'s behaviour', () => {
		expect(parseBookingMode('external')).toBe('external');
		expect(parseBookingMode('hallify')).toBe('hallify');
		expect(parseBookingMode(null)).toBe('hallify');
		expect(parseBookingMode('EXTERNAL')).toBe('hallify');
	});

	it('never offers Hallify booking for an external hall, even with reservations on', () => {
		expect(takesHallifyBookings({ allow_reservations: 1, booking_mode: 'hallify' })).toBe(true);
		expect(takesHallifyBookings({ allow_reservations: 1 })).toBe(true);
		expect(takesHallifyBookings({ allow_reservations: 0, booking_mode: 'hallify' })).toBe(false);
		expect(takesHallifyBookings({ allow_reservations: 1, booking_mode: 'external' })).toBe(false);
	});

	it('gives a directory card no booking link and no "booking" filter match when external', () => {
		expect(bookingHref(venue())).toBe('https://reduta.hallify.sk/halls/velka-sala/book');
		expect(bookingHref(venue({ booking_mode: 'external' }))).toBeNull();
		const list = [venue(), venue({ id: 'h2', booking_mode: 'external' })];
		expect(filterVenues(list, { query: '', guests: 0, floorplan: false, booking: true }).map((v) => v.id)).toEqual(['h1']);
	});
});

describe('listing type', () => {
	it('is external for a venue not on Hallify, whatever its partner flag says', () => {
		expect(listingType({ listing_only: 1, is_partner: 1 })).toBe('external');
		expect(listingType({ listing_only: 0, is_partner: 1 })).toBe('partner');
		expect(listingType({ listing_only: 0, is_partner: 0 })).toBe('basic');
	});

	it('is what a card reports, and nothing for a demo venue', () => {
		expect(venueListingRef(venue({ is_partner: true, listing_type: undefined }))).toEqual({ hall_id: 'h1', slug: 'velka-sala', venue_id: 'o1', listing_type: 'partner' });
		expect(venueListingRef(venue({ demo: true }))).toBeNull();
	});
});

describe('contact links', () => {
	it('only links http(s) websites', () => {
		expect(externalContact({ contact_website: 'https://reduta.sk' }).website).toBe('https://reduta.sk/');
		expect(externalContact({ contact_website: 'javascript:alert(1)' }).website).toBeNull();
		expect(externalContact({ contact_website: 'ftp://reduta.sk' }).website).toBeNull();
	});

	it('dials the digits and keeps the number as typed', () => {
		expect(telHref('+421 905 / 123 456')).toBe('tel:+421905123456');
		expect(externalContact({ contact_phone: ' 0905 123 456 ' }).phone).toBe('0905 123 456');
		expect(mailHref(' info@reduta.sk ')).toBe('mailto:info@reduta.sk');
	});

	it('drops an e-mail that is not one, and needs at least one way in', () => {
		expect(externalContact({ contact_email: 'not an email' }).email).toBeNull();
		expect(hasExternalContact(externalContact({}))).toBe(false);
		expect(hasExternalContact(externalContact({ contact_email: 'a@b.sk' }))).toBe(true);
	});

	it('checks phones and e-mails the way the forms do', () => {
		expect(validPhone('+421 905 123 456')).toBe(true);
		expect(validPhone('12')).toBe(false);
		expect(validPhone('call me')).toBe(false);
		expect(validEmail('info@reduta.sk')).toBe(true);
		expect(validEmail('info@reduta')).toBe(false);
	});
});
