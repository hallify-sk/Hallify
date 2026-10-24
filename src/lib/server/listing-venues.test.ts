import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

vi.mock('$lib/server/geocode', () => ({
	geocodeAddress: vi.fn(async (_db: unknown, address: string) =>
		address.includes('Levoča') ? { latitude: 49.02, longitude: 20.59, label: 'Levoča' } : null)
}));

import { testD1 } from './test-d1';
import { sk } from '$lib/i18n';
import { createListingVenue, deleteListingVenue, listListingVenues, loadListingVenue, parseListingVenueForm, updateListingVenue } from './listing-venues';
import { publicVenues } from './public-venues';
import { updateBookingSettings } from './ops/hall-ops';
import { venueSiteOrigin } from './discovery';

let db: D1Database;
let exec: (sql: string) => void;
const errors = sk.listings.errors;

const form = (fields: Record<string, string | string[]>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) for (const one of [v].flat()) data.append(k, one);
	return data;
};
const valid = { name: 'Mlyn Levoča', address: 'Námestie 1, Levoča', max_people: '120', website: 'www.mlyn.sk', is_public: 'on' };

beforeEach(async () => {
	({ db, exec } = await testD1());
});

describe('the listing form', () => {
	it('accepts a venue with one way in, normalising the website', () => {
		const r = parseListingVenueForm(form({ ...valid, amenities: ['parking', 'hot-tub'] }), errors);
		expect(r.ok && r.value).toMatchObject({ name: 'Mlyn Levoča', max_people: 120, website: 'https://www.mlyn.sk', phone: null, amenities: ['parking'], is_public: true });
	});

	it('refuses what would make a broken or unsafe listing', () => {
		const err = (fields: Record<string, string>) => {
			const r = parseListingVenueForm(form({ ...valid, ...fields }), errors);
			return r.ok ? null : r.error;
		};
		expect(err({ name: ' ' })).toBe(errors.nameRequired);
		expect(err({ address: '' })).toBe(errors.addressRequired);
		expect(err({ max_people: '0' })).toBe(errors.capacityInvalid);
		expect(err({ website: 'javascript:alert(1)' })).toBe(errors.invalidWebsite);
		expect(err({ website: 'http://localhost/admin' })).toBe(errors.invalidWebsite);
		expect(err({ website: '', phone: 'call us' })).toBe(errors.invalidPhone);
		expect(err({ website: '', email: 'nope' })).toBe(errors.invalidEmail);
		expect(err({ website: '' })).toBe(errors.contactRequired);
		expect(err({ cover_image_url: 'https://elsewhere.com/x.jpg' })).toBe(errors.coverNotUploaded);
		expect(err({ cover_image_url: '/uploads/halls/u1/123-a.jpg' })).toBeNull();
	});
});

describe('a venue not on Hallify', () => {
	it('is an organisation with no members and one external, public hall, placed on the map', async () => {
		const r = parseListingVenueForm(form(valid), errors);
		if (!r.ok) throw new Error(r.error);
		const { hallId } = await createListingVenue(db, r.value);
		const venue = await loadListingVenue(db, hallId);
		expect(venue).toMatchObject({ name: 'Mlyn Levoča', org_slug: 'mlyn-levoca', slug: 'mlyn-levoca', latitude: 49.02, is_public: 1 });
		const hall = await db.prepare('SELECT booking_mode, allow_reservations FROM halls WHERE id = ?').bind(hallId).first();
		expect(hall).toEqual({ booking_mode: 'external', allow_reservations: 0 });
		const members = await db.prepare('SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?').bind(venue!.org_id).first<{ n: number }>();
		expect(members?.n).toBe(0);
	});

	it('takes a free slug that is not a reserved subdomain', async () => {
		exec(`INSERT INTO organizations (id, name, slug) VALUES ('o', 'Mlyn', 'mlyn')`);
		const named = (name: string) => { const r = parseListingVenueForm(form({ ...valid, name }), errors); if (!r.ok) throw new Error(r.error); return r.value; };
		await createListingVenue(db, named('Mlyn'));
		await createListingVenue(db, named('Admin'));
		const slugs = (await listListingVenues(db)).map((v) => v.org_slug).sort();
		expect(slugs).toEqual(['admin-2', 'mlyn-2']);
	});

	it('is in the directory with its contacts, never as a partner and with no site to book on', async () => {
		const r = parseListingVenueForm(form({ ...valid, phone: '+421 905 111 222' }), errors);
		if (!r.ok) throw new Error(r.error);
		const { orgId } = await createListingVenue(db, r.value);
		// Even a ticked partner flag does not make it one.
		exec(`UPDATE organizations SET is_hallify_partner = 1 WHERE id = '${orgId}'`);
		const [venue] = await publicVenues(db, undefined, { url: new URL('https://hallify.sk/priestory'), appDomain: 'hallify.sk' });
		expect(venue).toMatchObject({
			is_partner: false, listing_type: 'external', booking_mode: 'external', site_url: null, allow_reservations: 0,
			contact: { website: 'https://www.mlyn.sk/', phone: '+421 905 111 222', email: null }
		});
		expect(venueSiteOrigin({ slug: 'mlyn-levoca', listing_only: 1 }, new URL('https://hallify.sk'), 'hallify.sk')).toBeNull();
		expect(venueSiteOrigin({ slug: 'mlyn-levoca', listing_only: 0 }, new URL('https://hallify.sk'), 'hallify.sk')).toBe('https://mlyn-levoca.hallify.sk');
	});

	it('can be edited, renaming the organisation too, and deleted with its counters', async () => {
		const r = parseListingVenueForm(form(valid), errors);
		if (!r.ok) throw new Error(r.error);
		const { hallId, orgId } = await createListingVenue(db, r.value);
		exec(`INSERT INTO listing_stats (hall_id, day, impressions) VALUES ('${hallId}', '2026-10-01', 5)`);
		const next = parseListingVenueForm(form({ ...valid, name: 'Starý mlyn', is_public: '' }), errors);
		if (!next.ok) throw new Error(next.error);
		await updateListingVenue(db, null, (await loadListingVenue(db, hallId))!, next.value);
		expect(await loadListingVenue(db, hallId)).toMatchObject({ name: 'Starý mlyn', is_public: 0 });
		expect((await db.prepare('SELECT name FROM organizations WHERE id = ?').bind(orgId).first<{ name: string }>())?.name).toBe('Starý mlyn');

		await deleteListingVenue(db, null, (await loadListingVenue(db, hallId))!);
		expect(await listListingVenues(db)).toEqual([]);
		expect((await db.prepare('SELECT COUNT(*) AS n FROM listing_stats').first<{ n: number }>())?.n).toBe(0);
	});
});

describe('a Hallify venue switching a hall to direct bookings', () => {
	beforeEach(() => {
		exec(`
			INSERT INTO organizations (id, name, slug) VALUES ('org', 'Reduta', 'reduta');
			INSERT INTO halls (id, org_id, name, allow_reservations) VALUES ('h', 'org', 'Sála', 1);
		`);
	});

	it('needs a website, phone or e-mail first', async () => {
		const res = await updateBookingSettings(db, 'org', 'h', { booking_mode: 'external' }, 'sk');
		expect(res).toMatchObject({ ok: false, status: 400, error: sk.listings.needsContact });
	});

	it('closes Hallify bookings while external, and reopens them only on the way back', async () => {
		exec(`UPDATE halls SET contact_email = 'info@reduta.sk' WHERE id = 'h'`);
		expect(await updateBookingSettings(db, 'org', 'h', { booking_mode: 'external', allow_reservations: true }, 'sk')).toMatchObject({ ok: true });
		const row = () => db.prepare('SELECT booking_mode, allow_reservations FROM halls WHERE id = ?').bind('h').first();
		expect(await row()).toEqual({ booking_mode: 'external', allow_reservations: 0 });
		await updateBookingSettings(db, 'org', 'h', { allow_reservations: true }, 'sk');
		expect(await row()).toEqual({ booking_mode: 'external', allow_reservations: 0 });
		await updateBookingSettings(db, 'org', 'h', { booking_mode: 'hallify', allow_reservations: true }, 'sk');
		expect(await row()).toEqual({ booking_mode: 'hallify', allow_reservations: 1 });
	});
});

describe('the cover photo credit', () => {
	const cover = '/uploads/halls/u1/1-a.jpg';

	it('is kept with a cover and cleared without one', () => {
		const withCover = parseListingVenueForm(form({ ...valid, cover_image_url: cover, cover_image_credit: ' https://www.mlyn.sk ' }), errors);
		expect(withCover.ok && withCover.value).toMatchObject({ cover_image_url: cover, cover_image_credit: 'https://www.mlyn.sk' });
		const without = parseListingVenueForm(form({ ...valid, cover_image_credit: 'https://www.mlyn.sk' }), errors);
		expect(without.ok && without.value).toMatchObject({ cover_image_url: null, cover_image_credit: null });
	});

	it('is stored, shown in the directory, and goes when the photo is removed', async () => {
		const parsed = parseListingVenueForm(form({ ...valid, cover_image_url: cover, cover_image_credit: 'https://www.mlyn.sk' }), errors);
		if (!parsed.ok) throw new Error(parsed.error);
		const { hallId } = await createListingVenue(db, parsed.value);
		expect((await publicVenues(db)).find((v) => v.id === hallId)?.cover_image_credit).toBe('https://www.mlyn.sk');
		const current = (await loadListingVenue(db, hallId))!;
		expect(current.cover_image_credit).toBe('https://www.mlyn.sk');
		const cleared = parseListingVenueForm(form({ ...valid, cover_image_url: '', cover_image_credit: 'https://www.mlyn.sk' }), errors, current.cover_image_url);
		if (!cleared.ok) throw new Error(cleared.error);
		await updateListingVenue(db, null, current, cleared.value);
		expect(await loadListingVenue(db, hallId)).toMatchObject({ cover_image_url: null, cover_image_credit: null });
	});
});
