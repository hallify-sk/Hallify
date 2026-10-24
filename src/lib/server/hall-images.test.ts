import { describe, expect, it } from 'vitest';
import { d1, migratedSqlite } from './test-d1';
import { deleteUnusedHallImages, hallImageKey, hallImageUrls, isOwnHallImage, orgUploadUrls, ownUploadUrlsIn } from './hall-images';
import { archiveAndDeleteOrg } from '$lib/orgLifecycle';

const A = '/uploads/halls/u1/1-a.jpg';
const B = '/uploads/halls/u1/2-b.webp';
const C = '/uploads/halls/u2/3-c.png';

function setup() {
	const sqlite = migratedSqlite('0014');
	sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('o1','Org','org')");
	sqlite.exec(`INSERT INTO halls(id,org_id,name,slug,cover_image_url,gallery_images) VALUES
		('h1','o1','One','one','${A}','["${A}","${B}"]'),
		('h2','o1','Two','two',NULL,'["${B}"]')`);
	const deleted: string[] = [];
	const r2 = { delete: async (key: string | string[]) => { deleted.push(...[key].flat()); } };
	return { sqlite, db: d1(sqlite), r2, deleted };
}

describe('hall images', () => {
	it('recognises only our own uploads', () => {
		expect(isOwnHallImage(A)).toBe(true);
		expect(isOwnHallImage('https://www.google.com/url?q=x.jpg')).toBe(false);
		expect(isOwnHallImage('/uploads/ai-documents/x.pdf')).toBe(false);
		expect(hallImageKey(B)).toBe('halls/u1/2-b.webp');
		expect(hallImageUrls({ cover_image_url: A, gallery_images: `["${A}","${C}"]` })).toEqual([A, C]);
	});

	it('deletes a photo only when nothing shows it any more', async () => {
		const { sqlite, db, r2, deleted } = setup();
		sqlite.exec("DELETE FROM halls WHERE id = 'h1'");
		const n = await deleteUnusedHallImages(db, r2, [A, B, 'https://elsewhere.example/x.jpg']);
		expect(n).toBe(1);
		// With its smaller copies (I2); B is still in h2's gallery.
		expect(deleted).toEqual(['halls/u1/1-a.jpg', 'halls/u1/1-a.jpg@w480', 'halls/u1/1-a.jpg@w1200']);
	});

	it('does nothing without storage', async () => {
		const { db } = setup();
		expect(await deleteUnusedHallImages(db, undefined, [C])).toBe(0);
	});
});

describe('closing an organisation', () => {
	const LOGO = '/uploads/halls/u1/4-logo.png';
	const SITE = '/uploads/halls/u1/5-hero.jpg';
	const ATT = '/uploads/halls/u3/6-att.jpg';
	const OTHER = '/uploads/halls/u9/7-other.jpg';

	function closable() {
		const sqlite = migratedSqlite();
		sqlite.exec(`INSERT INTO organizations(id,name,slug,logo_url) VALUES ('o1','Org','org','${LOGO}'), ('o2','Other','other',NULL)`);
		sqlite.exec(`INSERT INTO halls(id,org_id,name,slug,cover_image_url,gallery_images) VALUES
			('h1','o1','One','one','${A}','["${A}","${B}"]'),
			('h9','o2','Nine','nine','${OTHER}','["${C}"]')`);
		sqlite.exec(`INSERT INTO org_settings(org_id,key,value) VALUES ('o1','site','{"hero":"${SITE}","x":"https://elsewhere.example/a.jpg"}')`);
		sqlite.exec(`INSERT INTO users(id,email,password_hash,first_name,last_name,account_type,org_id) VALUES ('c1','c@x.sk','x','C','L','client','o1')`);
		sqlite.exec(`INSERT INTO tickets(id,user_id,org_id,subject) VALUES ('t1','c1',NULL,'Q')`);
		sqlite.exec(`INSERT INTO messages(id,ticket_id,sender_id,body,attachment_url) VALUES ('m1','t1','c1','hi','${ATT}')`);
		const deleted: string[] = [];
		const r2 = { delete: async (key: string | string[]) => { deleted.push(...[key].flat()); } };
		return { sqlite, db: d1(sqlite), r2, deleted };
	}

	it('finds every picture the organisation shows or holds', async () => {
		const { db } = closable();
		expect(ownUploadUrlsIn('{"a":"/uploads/halls/u1/x.webp","b":"/uploads/other"}')).toEqual(['/uploads/halls/u1/x.webp']);
		expect((await orgUploadUrls(db, 'o1')).sort()).toEqual([A, B, LOGO, SITE, ATT].sort());
	});

	it("deletes the closed organisation's pictures from storage, and only those (B152)", async () => {
		const { db, r2, deleted } = closable();
		await archiveAndDeleteOrg(db, 'o1', { reason: 'owner_closed', r2 });
		const originals = deleted.filter((k) => !k.includes('@'));
		expect(originals.sort()).toEqual([A, B, LOGO, SITE, ATT].map((u) => u.replace('/uploads/', '')).sort());
		expect(deleted).not.toContain(hallImageKey(OTHER));
		expect(deleted).not.toContain(hallImageKey(C));
	});
});
