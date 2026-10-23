import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const envMock = vi.hoisted(() => ({
	env: {
		BREVO_API_KEY: 'test-key',
		EMAIL_FROM: 'noreply@hallify.sk',
		EMAIL_FROM_NAME: 'Hallify',
		APP_URL: 'https://hallify.sk',
		HALLIFY_DOMAIN: 'hallify.sk',
	} as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => envMock);

import {
	describeChanges, getEmailHealth, isConfigError, isDefaultTemplate, notifyGuestMessage, notifyNewReservation,
	notifyStatusChange, reservationChanges, resolveTemplates, staffRecipients,
} from './email';
import { renderTemplate, styleBody } from './server/email-layout';
import { DEFAULT_TEMPLATES, EMAIL_COPY, LEGACY_DEFAULT_TEMPLATES } from './server/email-copy';
import { runInRequestScope } from './server/background';

// ── A D1 stand-in over node:sqlite with the real schema ─────────────────────

const MIGRATIONS = ['0001_baseline.sql', '0011_hall_archive.sql', '0016_user_locale.sql'];

function database() {
	const sqlite = new DatabaseSync(':memory:');
	for (const file of MIGRATIONS) {
		sqlite.exec(readFileSync(new URL(`../../migrations/${file}`, import.meta.url), 'utf8'));
	}
	return sqlite;
}

function d1(sqlite: DatabaseSync): App.Locals['db'] {
	const stmt = (sql: string, values: unknown[] = []) => ({
		bind: (...args: unknown[]) => stmt(sql, args),
		first: async () => (sqlite.prepare(sql).get(...(values as never[])) ?? null),
		all: async () => ({ results: sqlite.prepare(sql).all(...(values as never[])) }),
		run: async () => { sqlite.prepare(sql).run(...(values as never[])); return { success: true }; },
	});
	return { prepare: (sql: string) => stmt(sql) } as unknown as App.Locals['db'];
}

function seed(sqlite: DatabaseSync) {
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ Teplička', 'kastiel');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, locale)
			VALUES ('owner', 'owner@venue.sk', 'x', 'Olga', 'Owner', 'organization', NULL),
			       ('admin', 'admin@venue.sk', 'x', 'Adam', 'Admin', 'organization', 'en'),
			       ('member', 'member@venue.sk', 'x', 'Mia', 'Member', 'organization', NULL);
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, locale)
			VALUES ('client', 'client@example.com', 'x', '<a href=https://evil.example>Overte účet</a>', 'Nový', 'client', 'org', NULL);
		INSERT INTO organization_members (id, org_id, user_id, role) VALUES ('m1', 'org', 'owner', 'owner'), ('m2', 'org', 'admin', 'admin'), ('m3', 'org', 'member', 'member');
		INSERT INTO halls (id, org_id, name, contact_email) VALUES ('hall', 'org', 'Veľká sála', 'sala@venue.sk');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, start_time, end_time, status, invite_code, num_guests)
			VALUES ('res', 'org', 'hall', 'client', 'Svadba <img src=x>', '2027-05-22', '14:00', '23:00', 'pending', 'ABC', 80);
	`);
}

interface Sent { to: string; subject: string; html: string; sender: { name: string }; replyTo?: { email: string } }

let sqlite: DatabaseSync;
let db: App.Locals['db'];
let sent: Sent[];

beforeEach(() => {
	sqlite = database();
	seed(sqlite);
	db = d1(sqlite);
	sent = [];
	envMock.env.BREVO_API_KEY = 'test-key';
	vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
		const body = JSON.parse(init.body);
		sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent, sender: body.sender, replyTo: body.replyTo });
		return new Response('{}', { status: 201 });
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
	sqlite.close();
});

// ── Escaping (B9) ───────────────────────────────────────────────────────────

describe('template rendering', () => {
	it('escapes every variable, so client text cannot become links or images', () => {
		const html = renderTemplate('<p>{{userName}} booked {{title}}</p>', {
			userName: '<a href="https://evil.example">Overte účet</a>',
			title: '<img src="https://track.example/p.gif">',
		});
		expect(html).not.toMatch(/<a |<img /);
		expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
	});

	it('keeps line breaks of messages and drops paragraphs left empty', () => {
		expect(renderTemplate('<blockquote>{{message}}</blockquote>', { message: 'a\nb' })).toBe('<blockquote>a<br>b</blockquote>');
		expect(renderTemplate('<p>x</p>\n<p>{{changes}}</p>', { changes: '' })).toBe('<p>x</p>\n');
	});

	it('styles bare tags inline and leaves look-alike tags alone', () => {
		const html = styleBody('<h2>T</h2><p>x <b>y</b></p><pre>z</pre><blockquote style="color:red">q</blockquote>');
		expect(html).toMatch(/<h2 style="[^"]+">/);
		expect(html).toMatch(/<p style="[^"]+">/);
		expect(html).toContain('<b>y</b>');
		expect(html).toContain('<pre>z</pre>');
		expect(html).toMatch(/<blockquote style="[^"]+;color:red">/);
	});
});

// ── Templates (B96, B10) ────────────────────────────────────────────────────

describe('template resolution', () => {
	it('uses the default when a stored template is empty or blank', () => {
		const t = resolveTemplates({ newReservation: '', guestMessage: '   \n ' }, 'sk');
		expect(t.newReservation).toBe(DEFAULT_TEMPLATES.sk.newReservation);
		expect(t.guestMessage).toBe(DEFAULT_TEMPLATES.sk.guestMessage);
	});

	it('treats a saved copy of a default (old English ones too) as not customised', () => {
		const stored = { ...LEGACY_DEFAULT_TEMPLATES, statusChange: DEFAULT_TEMPLATES.sk.statusChange };
		expect(resolveTemplates(stored, 'sk')).toEqual(DEFAULT_TEMPLATES.sk);
		expect(resolveTemplates(stored, 'en')).toEqual(DEFAULT_TEMPLATES.en);
		expect(isDefaultTemplate('newReservation', `  ${DEFAULT_TEMPLATES.en.newReservation.replace('\n', '\n\n')} `)).toBe(true);
	});

	it('keeps a real customisation', () => {
		expect(resolveTemplates({ testEmail: '<p>Ahoj</p>' }, 'en').testEmail).toBe('<p>Ahoj</p>');
	});

	it('has the same copy keys in both languages', () => {
		const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) =>
			v && typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k]).sort();
		expect(keys(EMAIL_COPY.en)).toEqual(keys(EMAIL_COPY.sk));
		expect(Object.keys(DEFAULT_TEMPLATES.en).sort()).toEqual(Object.keys(DEFAULT_TEMPLATES.sk).sort());
	});
});

describe('booking changes', () => {
	it('lists what the client changed, in the reader’s language', () => {
		const changes = reservationChanges(
			{ title: 'Svadba', event_date: '2027-05-22', start_time: '14:00:00', end_time: null, num_guests: 80, description: 'x' },
			{ title: 'Svadba', event_date: '2027-05-23', start_time: '14:00', end_time: '22:00', num_guests: 80, description: 'x' },
		);
		expect(changes.map((c) => c.field)).toEqual(['date', 'endTime']);
		const sk = describeChanges(changes, 'sk');
		expect(sk).toContain('Dátum: 22. mája 2027 → 23. mája 2027');
		expect(sk).toContain('Koniec: – → 22:00');
		expect(describeChanges([], 'en')).toBe(EMAIL_COPY.en.changes.unknown);
	});
});

// ── Recipients (B112, B113) ─────────────────────────────────────────────────

describe('staff recipients', () => {
	it('"whole team" includes plain members', async () => {
		const r = await staffRecipients(db, 'org', null);
		expect(r.map((x) => x.email).sort()).toEqual(['admin@venue.sk', 'member@venue.sk', 'owner@venue.sk']);
	});

	it('honours a chosen member, and [] means nobody', async () => {
		expect((await staffRecipients(db, 'org', ['member'])).map((x) => x.email)).toEqual(['member@venue.sk']);
		expect(await staffRecipients(db, 'org', [])).toEqual([]);
	});

	it('falls back to the whole team when every chosen person has left', async () => {
		sqlite.exec("DELETE FROM organization_members WHERE user_id = 'admin'");
		const r = await staffRecipients(db, 'org', ['admin']);
		expect(r.map((x) => x.email).sort()).toEqual(['member@venue.sk', 'owner@venue.sk']);
	});
});

// ── Whole emails (B8, B9, B10, M5, I6) ──────────────────────────────────────

describe('notification emails', () => {
	it('new booking: each staff member in their language, escaped, with link, details and Reply-To', async () => {
		await notifyNewReservation(db, 'org', 'Svadba <img src=x>', '<a href=https://evil.example>Overte účet</a> Nový', 'Veľká sála', '2027-05-22', { reservationId: 'res' });
		expect(sent).toHaveLength(3);
		const admin = sent.find((s) => s.to === 'admin@venue.sk')!;
		const owner = sent.find((s) => s.to === 'owner@venue.sk')!;
		expect(admin.subject).toBe('New reservation: Svadba <img src=x>');
		expect(owner.subject).toBe('Nová rezervácia: Svadba <img src=x>');
		for (const mail of [admin, owner]) {
			expect(mail.html).not.toMatch(/<a href=https:\/\/evil|<img src=x>/);
			expect(mail.html).toContain('https://hallify.sk/app/reservation/res');
			expect(mail.replyTo?.email).toBe('client@example.com');
			expect(mail.html).toContain('Kaštieľ Teplička');
		}
		expect(owner.html).toContain('22. mája 2027');
		expect(owner.html).toContain('14:00 – 23:00');
		expect(admin.html).toContain('22 May 2027');
	});

	it('status change: Slovak by default, translated status, explanation, venue note, venue sender and Reply-To', async () => {
		await notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'waiting_payment', { reservationId: 'res', message: 'Záloha 200 €\ndo piatku' });
		expect(sent).toHaveLength(1);
		const mail = sent[0];
		expect(mail.subject).toBe('Svadba: Čaká na platbu');
		expect(mail.html).not.toContain('waiting_payment');
		expect(mail.html).toContain(EMAIL_COPY.sk.statusInfo.waiting_payment);
		expect(mail.html).toContain('Záloha 200 €<br>do piatku');
		expect(mail.html).toContain('https://kastiel.hallify.sk/halls/my-reservations/res');
		expect(mail.sender.name).toBe('Kaštieľ Teplička cez Hallify');
		expect(mail.replyTo?.email).toBe('sala@venue.sk');
	});

	it('writes to a client in English once they chose English', async () => {
		sqlite.exec("UPDATE users SET locale = 'en' WHERE id = 'client'");
		await notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'approved', { reservationId: 'res' });
		expect(sent[0].subject).toBe('Svadba: Approved');
		expect(sent[0].html).toContain('<html lang="en">');
	});

	it('guest message carries the message, with line breaks, and links to the thread', async () => {
		sqlite.exec("INSERT INTO tickets (id, org_id, user_id, reservation_id, subject) VALUES ('t1', 'org', 'client', 'res', 'Veľká sála – 22. 5.')");
		await notifyGuestMessage(db, 'org', 'Klient', 'Veľká sála – 22. 5.', 'Dobrý deň,\n<script>x</script>', { ticketId: 't1' });
		const owner = sent.find((s) => s.to === 'owner@venue.sk')!;
		expect(owner.html).toContain('Dobrý deň,<br>&lt;script&gt;x&lt;/script&gt;');
		expect(owner.html).toContain('https://hallify.sk/app/manage/messages/t1');
	});

	it('is kept alive with waitUntil when fired and forgotten inside a request', async () => {
		const waitUntil = vi.fn();
		let p!: Promise<void>;
		runInRequestScope({ waitUntil, url: new URL('https://kastiel.hallify.sk/halls') }, () => {
			p = notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'approved', { reservationId: 'res' });
		});
		expect(waitUntil).toHaveBeenCalled();
		await p;
		expect(sent).toHaveLength(1);
	});
});

// ── Delivery health (B3) ────────────────────────────────────────────────────

describe('delivery health', () => {
	it('recognises errors that stop every email', () => {
		expect(isConfigError('Brevo 401: {"message":"API Key is not enabled"}')).toBe(true);
		expect(isConfigError('BREVO_API_KEY not configured')).toBe(true);
		expect(isConfigError('Brevo 400: invalid email')).toBe(false);
	});

	it('is down while the latest attempt was refused for the key, and recovers on the next delivery', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"API Key is not enabled"}', { status: 401 })));
		await notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'approved', { reservationId: 'res' });
		let h = await getEmailHealth(db);
		expect(h.down).toBe(true);
		expect(h.lastError).toContain('Brevo 401');

		sqlite.exec("INSERT INTO email_log (id, recipient, subject, status, created_at) VALUES ('ok', 'a@b.sk', 's', 'sent', datetime('now', '+1 second'))");
		h = await getEmailHealth(db);
		expect(h.down).toBe(false);
	});

	it('is down without an API key', async () => {
		envMock.env.BREVO_API_KEY = undefined;
		expect((await getEmailHealth(db)).down).toBe(true);
	});
});
