import { describe, expect, it } from 'vitest';
import {
	DuplicateIndex, checkImageBody, checkImageUrl, imageHost, importAddress, importFormData, importGeocodeQuery,
	importResultsCsv, normaliseText, readImportItem, websiteHost
} from './listing-import';

const sample = {
	name: 'Kaštieľ Mošovce', city: 'Mošovce', country: 'SK', address: 'Hlavná 1', max_people: 150,
	event_types: ['svadba', 'catering'], website: 'https://www.kastiel-mosovce.sk/', phone: '+421 900 123 456',
	email: 'info@kastiel-mosovce.sk', description_sk: 'Barokový kaštieľ.', image_official: { url: 'https://upload.wikimedia.org/a.jpg', page: 'x' },
	rating: 4.8
};

describe('reading an item of the file', () => {
	it('takes the known keys, ignores the rest, and accepts the photo as an object or a string', () => {
		const item = readImportItem(sample)!;
		expect(item).toEqual({
			name: 'Kaštieľ Mošovce', city: 'Mošovce', country: 'SK', address: 'Hlavná 1', max_people: '150',
			event_types: ['svadba', 'catering'], website: 'https://www.kastiel-mosovce.sk/', phone: '+421 900 123 456',
			email: 'info@kastiel-mosovce.sk', description: 'Barokový kaštieľ.', image_url: 'https://upload.wikimedia.org/a.jpg',
			image_credit: ''
		});
		expect(readImportItem({ ...sample, image_credit: ' Jana / CC BY-SA 4.0 / Wikimedia Commons ' })!.image_credit)
			.toBe('Jana / CC BY-SA 4.0 / Wikimedia Commons');
		expect(readImportItem({ ...sample, image_official: 'https://x.sk/b.png' })!.image_url).toBe('https://x.sk/b.png');
		expect(readImportItem({ ...sample, image_official: null })!.image_url).toBeNull();
		expect(readImportItem({ ...sample, image_official: undefined })!.image_url).toBeNull();
	});

	it('never turns an object into text, and refuses what is not an object', () => {
		const item = readImportItem({ name: { x: 1 }, max_people: [1], event_types: 'svadba' })!;
		expect(item.name).toBe('');
		expect(item.max_people).toBe('');
		expect(item.event_types).toEqual([]);
		expect(readImportItem(null)).toBeNull();
		expect(readImportItem('Mlyn')).toBeNull();
		expect(readImportItem([sample])).toBeNull();
	});
});

describe('mapping an item to the form', () => {
	it('adds the city to the address unless it is there, and the country for the map lookup', () => {
		expect(importAddress({ address: 'Hlavná 1', city: 'Mošovce' })).toBe('Hlavná 1, Mošovce');
		expect(importAddress({ address: 'Hlavná 1, 038 21 Mosovce', city: 'Mošovce' })).toBe('Hlavná 1, 038 21 Mosovce');
		expect(importAddress({ address: '', city: 'Mošovce' })).toBe('Mošovce');
		expect(importGeocodeQuery({ address: 'Hlavná 1', city: 'Mošovce', country: 'SK' })).toBe('Hlavná 1, Mošovce, Slovensko');
		expect(importGeocodeQuery({ address: 'Náměstí 5, Brno', city: 'Brno', country: 'CZ' })).toBe('Náměstí 5, Brno, Česko');
		expect(importGeocodeQuery({ address: 'Hlavná 1, Mošovce, Slovensko', city: 'Mošovce', country: 'SK' })).toBe('Hlavná 1, Mošovce, Slovensko');
		expect(importGeocodeQuery({ address: 'Hlavná 1', city: 'Mošovce', country: '' })).toBe('Hlavná 1, Mošovce');
	});

	it('posts the fields of the "Add venue" form, listed', () => {
		const data = importFormData(readImportItem(sample)!);
		expect(data.get('name')).toBe('Kaštieľ Mošovce');
		expect(data.get('address')).toBe('Hlavná 1, Mošovce');
		expect(data.get('max_people')).toBe('150');
		expect(data.get('description')).toBe('Barokový kaštieľ.');
		expect(data.getAll('amenities')).toEqual(['svadba', 'catering']);
		expect(data.get('is_public')).toBe('on');
		expect(data.get('cover_image_url')).toBeNull();
	});
});

describe('duplicates', () => {
	const index = () => new DuplicateIndex([
		{ name: 'Mlyn Levoča', org_name: 'Mlyn s.r.o.', address: 'Námestie 1, Levoča', website: 'https://www.mlyn.sk/sala' },
		{ name: 'Sála na Facebooku', address: 'Hlavná 2, Prešov', website: 'https://www.facebook.com/sala' },
		{ name: 'Bez webu', address: null, website: null }
	]);

	it('matches the same website host, whatever its scheme, www or path', () => {
		expect(websiteHost('http://WWW.Mlyn.sk/kontakt')).toBe('mlyn.sk');
		expect(index().find({ name: 'Iný názov', city: 'Košice', website: 'mlyn.sk' })).toEqual({ kind: 'website', of: 'Mlyn Levoča' });
	});

	it('matches the same name in the same city, ignoring case and diacritics', () => {
		expect(normaliseText('Kaštieľ  Mošovce, s.r.o.')).toBe('kastiel mosovce s r o');
		expect(index().find({ name: 'MLYN levoca', city: 'Levoča', website: '' })).toEqual({ kind: 'name_city', of: 'Mlyn Levoča' });
		// The organisation's name counts too.
		expect(index().find({ name: 'Mlyn s. r. o.', city: 'Levoca', website: '' })?.kind).toBe('name_city');
	});

	it('does not match the same name elsewhere, a shared host, or a city only part of a word', () => {
		expect(index().find({ name: 'Mlyn Levoča', city: 'Bratislava', website: '' })).toBeNull();
		expect(index().find({ name: 'Iná sála', city: 'Prešov', website: 'https://facebook.com/ina' })).toBeNull();
		expect(index().find({ name: 'Mlyn Levoča', city: 'Levo', website: '' })).toBeNull();
		expect(index().find({ name: 'Bez webu', city: '', website: '' })).toBeNull();
	});

	it('finds a copy later in the same file once the first is added', () => {
		const ix = index();
		expect(ix.find({ name: 'Nová sála', city: 'Žilina', website: 'nova.sk' })).toBeNull();
		ix.add({ name: 'Nová sála', address: 'Ulica 1, Žilina', website: 'https://nova.sk' });
		expect(ix.find({ name: 'Nová sála', city: 'Zilina', website: '' })).toEqual({ kind: 'name_city', of: 'Nová sála' });
		expect(ix.find({ name: 'Iná', city: 'Žilina', website: 'https://www.nova.sk/x' })?.kind).toBe('website');
	});
});

describe('photo address safety', () => {
	it('accepts a public https address', () => {
		expect(checkImageUrl('https://upload.wikimedia.org/wikipedia/commons/a/a1/X.jpg').ok).toBe(true);
	});

	it('refuses plain http, other schemes, credentials and odd ports', () => {
		expect(checkImageUrl('http://example.sk/a.jpg')).toEqual({ ok: false, error: 'not_https' });
		expect(checkImageUrl('ftp://example.sk/a.jpg')).toEqual({ ok: false, error: 'not_https' });
		expect(checkImageUrl('data:image/png;base64,AAAA')).toEqual({ ok: false, error: 'not_https' });
		expect(checkImageUrl('https://u:p@example.sk/a.jpg')).toEqual({ ok: false, error: 'invalid_url' });
		expect(checkImageUrl('https://example.sk:8443/a.jpg')).toEqual({ ok: false, error: 'invalid_url' });
		expect(checkImageUrl('not a url')).toEqual({ ok: false, error: 'invalid_url' });
	});

	it('refuses private, loopback, link-local and internal hosts', () => {
		for (const host of ['localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '[::1]', '[fd00::1]', 'db.internal', 'printer.local', 'intranet']) {
			expect(checkImageUrl(`https://${host}/a.jpg`), host).toEqual({ ok: false, error: 'private_host' });
		}
	});

	it('keeps only a JPEG, PNG or WebP by both its declared type and its bytes, up to 8 MB', () => {
		expect(checkImageBody('image/jpeg', 'image/jpeg', 120_000)).toEqual({ ok: true, type: 'image/jpeg' });
		expect(checkImageBody('Image/PNG; charset=binary', 'image/png', 50_000)).toEqual({ ok: true, type: 'image/png' });
		expect(checkImageBody('image/webp', 'image/webp', 1)).toEqual({ ok: true, type: 'image/webp' });
		expect(checkImageBody('image/gif', 'image/gif', 5000)).toEqual({ ok: false, error: 'not_image' });
		expect(checkImageBody('text/html', null, 5000)).toEqual({ ok: false, error: 'not_image' });
		expect(checkImageBody('image/jpeg', null, 5000)).toEqual({ ok: false, error: 'not_image' });
		expect(checkImageBody('image/png', 'image/jpeg', 5000)).toEqual({ ok: false, error: 'not_image' });
		expect(checkImageBody('image/jpeg', 'image/jpeg', 0)).toEqual({ ok: false, error: 'not_image' });
		expect(checkImageBody('image/jpeg', 'image/jpeg', 8 * 1024 * 1024 + 1)).toEqual({ ok: false, error: 'too_large' });
	});

	it('names the host a photo comes from for the preview', () => {
		expect(imageHost('https://upload.wikimedia.org/a.jpg')).toBe('upload.wikimedia.org');
		expect(imageHost('nonsense')).toBeNull();
		expect(imageHost(null)).toBeNull();
	});
});

describe('the result file', () => {
	it('is a CSV Excel reads, with formulas neutralised', () => {
		const csv = importResultsCsv(
			[{ index: 0, name: '=HYPERLINK("x")', status: 'created', reason: null, hall_id: 'h1', photo: 'ok' }],
			['#', 'Názov'], (r) => [String(r.index + 1), r.name]);
		expect(csv.startsWith('﻿#;Názov\r\n')).toBe(true);
		expect(csv).toContain(`1;"'=HYPERLINK(""x"")"`);
	});
});
