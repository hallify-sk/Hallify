import { describe, expect, it, vi, beforeEach } from 'vitest';

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('$lib/email', () => ({
	sendEmail: vi.fn(async (_db: unknown, to: string, subject: string, html: string) => { sent.push({ to, subject, html }); return true; })
}));

import { d1, migratedSqlite } from './test-d1';
import { announceMappingStatus, canDeliver, deliveryFileKey, mappingStatusEmail, safeFileName, sniffDeliveryType } from './floorplan-mapping';
import { readFileSync } from 'node:fs';

function setup() {
	const sqlite = migratedSqlite();
	sqlite.exec(`
		INSERT INTO organizations(id,name,slug) VALUES ('o1','Kaštieľ','kastiel');
		INSERT INTO users(id,email,password_hash,first_name,last_name,locale) VALUES
			('u1','asker@x.sk','x','A','B','en'), ('u2','owner@x.sk','x','O','W','sk'), ('pa','admin@hallify.sk','x','P','A','sk');
		INSERT INTO organization_members(id,org_id,user_id,role) VALUES ('m1','o1','u1','admin'), ('m2','o1','u2','owner');
		INSERT INTO halls(id,org_id,name,slug) VALUES ('h1','o1','Veľká <sála>','velka');
		INSERT INTO floorplan_requests(id,org_id,hall_id,requested_by,status,reply_note,delivery_file_name)
			VALUES ('r1','o1','h1','u1','delivered','Hotovo, <b>pozrite</b>','podorys.pdf');
	`);
	return { sqlite, db: d1(sqlite) };
}

describe('venue mapping (M25)', () => {
	beforeEach(() => { sent.length = 0; });

	it('delivers only when there is something to hand over', () => {
		expect(canDeliver(false, false)).toBe(false);
		expect(canDeliver(true, false)).toBe(true);
		expect(canDeliver(false, true)).toBe(true);
	});

	it('accepts a PDF or a still picture, by its bytes', () => {
		expect(sniffDeliveryType(new TextEncoder().encode('%PDF-1.7\n'))).toBe('application/pdf');
		expect(sniffDeliveryType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
		expect(sniffDeliveryType(new TextEncoder().encode('GIF89a......'))).toBeNull();
		expect(sniffDeliveryType(new TextEncoder().encode('<html>'))).toBeNull();
	});

	it('keeps delivered files out of the public upload prefix', () => {
		expect(deliveryFileKey('r1', 'Pôdorys sály.pdf')).toMatch(/^floorplan-deliveries\/r1\/\d+-Podorys-saly\.pdf$/);
		expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
		expect(safeFileName('???')).toBe('podorys');
	});

	it('writes the email in the reader\'s language and escapes what people typed', () => {
		const { subject, html } = mappingStatusEmail('sk', { hall: 'Sála <x>', status: 'scheduled', reply: 'Utorok 10:00', fileName: null, url: 'https://hallify.sk/app/manage/halls/h1#floorplan' });
		expect(subject).toBe('Zameranie priestoru Sála <x>: Dohodnutý termín');
		expect(html).toContain('Sála &lt;x&gt;');
		expect(html).not.toContain('Sála <x>');
		expect(html).toContain('Utorok 10:00');
		expect(mappingStatusEmail('en', { hall: 'Hall', status: 'delivered', reply: null, fileName: 'plan.pdf', url: 'https://x.sk' }).html).toContain('plan.pdf');
	});

	it('emails whoever asked and notifies the organisation', async () => {
		const { sqlite, db } = setup();
		expect(await announceMappingStatus(db, 'r1', 'https://hallify.sk/', 'pa')).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0].to).toBe('asker@x.sk');
		expect(sent[0].subject).toBe('Venue mapping for Veľká <sála>: Delivered');
		expect(sent[0].html).toContain('https://hallify.sk/app/manage/halls/h1#floorplan');
		expect(sent[0].html).toContain('Hotovo, &lt;b&gt;pozrite&lt;/b&gt;');
		const n = sqlite.prepare("SELECT kind, area, link FROM org_notifications WHERE org_id = 'o1'").all();
		expect(n).toEqual([{ kind: 'mapping.updated', area: 'halls', link: '/app/manage/halls/h1#floorplan' }]);
	});

	it('falls back to the owners when the person who asked has left', async () => {
		const { sqlite, db } = setup();
		sqlite.exec("DELETE FROM organization_members WHERE user_id = 'u1'");
		await announceMappingStatus(db, 'r1', 'https://hallify.sk', null);
		expect(sent.map((m) => m.to)).toEqual(['owner@x.sk']);
		expect(sent[0].subject).toContain('Odovzdané');
	});

	it('migration 0037 only adds columns', () => {
		const sql = readFileSync(new URL('../../../migrations/0037_floorplan_request_delivery.sql', import.meta.url), 'utf8');
		const statements = sql.split('\n').filter((l) => /^\s*[A-Z]/.test(l));
		expect(statements.every((l) => /^ALTER TABLE floorplan_requests ADD COLUMN /.test(l))).toBe(true);
	});
});
