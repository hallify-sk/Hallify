import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

const geocode = vi.hoisted(() => vi.fn(async () => null));
vi.mock('$lib/server/geocode', () => ({ geocodeAddress: geocode }));

import { testD1 } from './test-d1';
import { sk } from '$lib/i18n';
import { OWN_HALL_IMAGE } from './hall-images';
import { createListingVenue, loadListingVenue } from './listing-venues';
import { importChunk, importListingImage, previewImport, websiteCredit } from './listing-import';

let db: D1Database;
let exec: (sql: string) => void;
const l = sk.listings;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(2000).fill(1)]);

const item = (over: Record<string, unknown> = {}) => ({
	name: 'Kaštieľ Mošovce', city: 'Mošovce', country: 'SK', address: 'Hlavná 1', max_people: 150,
	website: 'https://www.kastiel-mosovce.sk/', phone: '', email: '', description_sk: 'Barokový kaštieľ.',
	image_official: { url: 'https://upload.wikimedia.org/k.jpg', page: 'https://commons.wikimedia.org/k' }, ...over
});

class FakeR2 {
	objects = new Map<string, { size: number; type?: string }>();
	async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
		this.objects.set(key, { size: value.byteLength, type: opts?.httpMetadata?.contentType });
	}
	async delete(keys: string | string[]) {
		for (const k of [keys].flat()) this.objects.delete(k);
	}
}

const respond = (body: BodyInit | null, init: ResponseInit) => new Response(body, init);
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('admin-1', 'admin@hallify.sk', 'x', 'Ada', 'Admin')`);
	geocode.mockClear();
	fetchMock = vi.fn(async () => respond(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the preview', () => {
	it('marks each item ok, invalid (with the form\'s reason) or duplicate', async () => {
		await createListingVenue(db, {
			name: 'Mlyn Levoča', address: 'Námestie 1, Levoča', max_people: 100, description: null, cover_image_url: null,
			cover_image_credit: null, amenities: [], website: 'https://www.mlyn.sk', phone: null, email: null, is_public: true
		});
		const rows = await previewImport(db, [
			item(),
			item({ name: '' }),
			item({ name: 'Iný mlyn', website: 'mlyn.sk', city: 'Košice' }),
			item({ name: 'Mlyn Levoca', website: 'https://other.sk', city: 'Levoča' }),
			item({ max_people: 0, name: 'Bez kapacity' }),
			item({ website: '', phone: '', email: '', name: 'Bez kontaktu' }),
			item({ name: 'Kaštieľ Mošovce' }),
			'nonsense'
		], l);
		expect(rows.map((r) => r.status)).toEqual(['ok', 'invalid', 'duplicate', 'duplicate', 'invalid', 'invalid', 'duplicate', 'invalid']);
		expect(rows[0]).toMatchObject({ name: 'Kaštieľ Mošovce', city: 'Mošovce', max_people: '150', photo_host: 'upload.wikimedia.org', reason: null });
		expect(rows[1].reason).toBe(l.errors.nameRequired);
		expect(rows[2].reason).toBe(l.importDupWebsite('Mlyn Levoča'));
		expect(rows[3].reason).toBe(l.importDupNameCity('Mlyn Levoča'));
		expect(rows[4].reason).toBe(l.errors.capacityInvalid);
		expect(rows[5].reason).toBe(l.errors.contactRequired);
		// The same venue twice in one file: the second is a duplicate of the first.
		expect(rows[6].reason).toBe(l.importDupWebsite('Kaštieľ Mošovce'));
		expect(rows[7].reason).toBe(l.importNotObject);
	});
});

describe('the photo', () => {
	it('is stored where an upload goes, under a key the app treats as its own', async () => {
		const r2 = new FakeR2();
		const r = await importListingImage(r2, 'user-1', 'https://upload.wikimedia.org/k.jpg');
		expect(r.ok).toBe(true);
		const url = r.ok ? r.url : '';
		expect(url).toMatch(OWN_HALL_IMAGE);
		expect(url).toMatch(/^\/uploads\/halls\/user-1\/\d+-\w+\.jpg$/);
		expect([...r2.objects.values()]).toEqual([{ size: JPEG.byteLength, type: 'image/jpeg' }]);
	});

	it('refuses a private or plain-http address without fetching it', async () => {
		const r2 = new FakeR2();
		expect(await importListingImage(r2, 'u', 'https://127.0.0.1/a.jpg')).toEqual({ ok: false, error: 'private_host' });
		expect(await importListingImage(r2, 'u', 'http://example.sk/a.jpg')).toEqual({ ok: false, error: 'not_https' });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(r2.objects.size).toBe(0);
	});

	it('follows at most 3 redirects, never to http or a private host', async () => {
		const r2 = new FakeR2();
		fetchMock.mockImplementation(async () => respond(null, { status: 302, headers: { location: 'https://cdn.example.sk/next.jpg' } }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toEqual({ ok: false, error: 'redirects' });
		expect(fetchMock).toHaveBeenCalledTimes(4);

		fetchMock.mockReset();
		fetchMock.mockImplementationOnce(async () => respond(null, { status: 301, headers: { location: 'http://example.sk/a.jpg' } }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toEqual({ ok: false, error: 'private_host' });

		fetchMock.mockReset();
		fetchMock.mockImplementationOnce(async () => respond(null, { status: 301, headers: { location: 'https://192.168.0.1/a.jpg' } }));
		expect((await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).ok).toBe(false);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(r2.objects.size).toBe(0);
	});

	it('refuses what is not a JPEG, PNG or WebP, or is over 8 MB', async () => {
		const r2 = new FakeR2();
		fetchMock.mockImplementation(async () => respond('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toEqual({ ok: false, error: 'not_image' });
		fetchMock.mockImplementation(async () => respond('<html></html>', { status: 200, headers: { 'content-type': 'image/jpeg' } }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toEqual({ ok: false, error: 'not_image' });
		fetchMock.mockImplementation(async () => respond(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) } }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toEqual({ ok: false, error: 'too_large' });
		fetchMock.mockImplementation(async () => respond(null, { status: 404 }));
		expect(await importListingImage(r2, 'u', 'https://example.sk/a.jpg')).toMatchObject({ ok: false, error: 'fetch_failed' });
		expect(r2.objects.size).toBe(0);
	});
});

describe('importing a chunk', () => {
	const locals = () => ({ db, user: { id: 'admin-1', email: 'admin@hallify.sk' } }) as unknown as Pick<App.Locals, 'db' | 'user'>;

	it('creates the venue with its photo credited to its website, geocodes with the country, and audits it', async () => {
		const r2 = new FakeR2();
		const [r] = await importChunk(locals(), r2, [{ index: 3, item: item() }], l);
		expect(r).toMatchObject({ index: 3, name: 'Kaštieľ Mošovce', status: 'created', photo: 'ok' });
		const venue = await loadListingVenue(db, r.hall_id!);
		expect(venue).toMatchObject({
			name: 'Kaštieľ Mošovce', address: 'Hlavná 1, Mošovce', max_people: 150, is_public: 1,
			website: 'https://www.kastiel-mosovce.sk', cover_image_credit: 'https://www.kastiel-mosovce.sk', description: 'Barokový kaštieľ.'
		});
		expect(venue!.cover_image_url).toMatch(OWN_HALL_IMAGE);
		expect(geocode).toHaveBeenCalledWith(db, 'Hlavná 1, Mošovce, Slovensko');
		const audit = await db.prepare('SELECT action, target_id, target_label, details, actor_id FROM platform_audit_log').all();
		expect(audit.results).toEqual([expect.objectContaining({ action: 'listing.create', target_id: venue!.org_id, target_label: 'Kaštieľ Mošovce', actor_id: 'admin-1' })]);
	});

	it('imports a venue whose photo fails without one, and says why', async () => {
		fetchMock.mockImplementation(async () => respond(null, { status: 403 }));
		const [r] = await importChunk(locals(), new FakeR2(), [{ index: 0, item: item() }], l);
		expect(r).toMatchObject({ status: 'created', photo: 'fetch_failed' });
		const venue = await loadListingVenue(db, r.hall_id!);
		expect(venue).toMatchObject({ cover_image_url: null, cover_image_credit: null });
	});

	it('skips a venue added in the meantime and refuses an invalid one', async () => {
		const r2 = new FakeR2();
		await importChunk(locals(), r2, [{ index: 0, item: item({ image_official: null }) }], l);
		const results = await importChunk(locals(), r2, [
			{ index: 0, item: item({ image_official: null }) },
			{ index: 1, item: item({ name: 'Bez kapacity', website: 'https://ina.sk', max_people: 'veľa' }) }
		], l);
		expect(results).toMatchObject([
			{ index: 0, status: 'duplicate', reason: l.importDupWebsite('Kaštieľ Mošovce'), hall_id: null },
			{ index: 1, status: 'failed', reason: l.errors.capacityInvalid, hall_id: null }
		]);
	});

	it('credits the website as its origin', () => {
		expect(websiteCredit('www.example.sk/sala')).toBe('https://www.example.sk');
		expect(websiteCredit(null)).toBeNull();
	});
});
