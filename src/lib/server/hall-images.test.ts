import { describe, expect, it } from 'vitest';
import { d1, migratedSqlite } from './test-d1';
import { deleteUnusedHallImages, hallImageKey, hallImageUrls, isOwnHallImage } from './hall-images';

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
		expect(deleted).toEqual(['halls/u1/1-a.jpg']); // B is still in h2's gallery
	});

	it('does nothing without storage', async () => {
		const { db } = setup();
		expect(await deleteUnusedHallImages(db, undefined, [C])).toBe(0);
	});
});
