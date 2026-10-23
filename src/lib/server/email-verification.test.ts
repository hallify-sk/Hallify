import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	createEmailVerification,
	isGatedPath,
	isOn,
	mailboxProven,
	markEmailChanged,
	verificationEmail,
	verifyEmailToken,
	VERIFY_TTL_MS
} from './email-verification';
import { d1, migratedSqlite } from './test-d1';

function setup() {
	const sqlite = migratedSqlite();
	sqlite.exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('v1', 'Venue One', 'one');
		INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('acc', 'jana@x.sk', 'h', 'Jana', 'Nová');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id, account_id)
		  VALUES ('linked', 'jana@x.sk', '!linked', 'Jana', 'Nová', 'client', 'v1', 'acc');
		UPDATE users SET email_verified_at = NULL;
	`);
	return { sqlite, db: d1(sqlite) };
}

const verified = (sqlite: ReturnType<typeof migratedSqlite>, id: string) =>
	(sqlite.prepare('SELECT email_verified_at AS v FROM users WHERE id = ?').get(id) as { v: string | null }).v;

describe('the migration', () => {
	it('treats every account that already existed as verified', () => {
		const sqlite = migratedSqlite('0029');
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES ('old', 'o@x.sk', 'h', 'O', 'L')`);
		sqlite.exec(readFileSync(new URL('../../../migrations/0030_identity.sql', import.meta.url), 'utf8'));
		expect(verified(sqlite, 'old')).not.toBeNull();
	});
});

describe('verification links', () => {
	it('verifies the account and its linked venue rows, and claims old venue accounts', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO organizations (id, name, slug) VALUES ('v2', 'Two', 'two');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', 'oldhash', 'J', 'N', 'client', 'v2')`);
		const token = await createEmailVerification(db, 'acc', 'jana@x.sk');
		const stored = sqlite.prepare('SELECT token FROM email_verifications').get() as { token: string };
		expect(stored.token).not.toBe(token);

		expect(await verifyEmailToken(db, token)).toEqual({ status: 'verified', userId: 'acc', email: 'jana@x.sk', claimed: 1 });
		expect(verified(sqlite, 'acc')).not.toBeNull();
		expect(verified(sqlite, 'linked')).not.toBeNull();
		expect(sqlite.prepare("SELECT account_id, password_hash FROM users WHERE id = 'old'").get()).toMatchObject({ account_id: 'acc', password_hash: '!linked' });
		// A second click is still a success, and claims nothing more.
		expect(await verifyEmailToken(db, token)).toMatchObject({ status: 'verified', claimed: 0 });
	});

	it('refuses unknown, expired and stale links', async () => {
		const { db } = setup();
		expect(await verifyEmailToken(db, 'nope')).toEqual({ status: 'invalid' });
		const old = await createEmailVerification(db, 'acc', 'jana@x.sk', Date.now() - VERIFY_TTL_MS - 1000);
		expect(await verifyEmailToken(db, old)).toEqual({ status: 'expired' });
		const before = await createEmailVerification(db, 'acc', 'jana@x.sk');
		await markEmailChanged(db, 'acc', { email: 'new@x.sk', firstName: 'Jana', lastName: 'Nová' });
		expect(await verifyEmailToken(db, before)).toEqual({ status: 'stale' });
	});

	it('an email change unverifies the account and moves its linked rows', async () => {
		const { sqlite, db } = setup();
		sqlite.exec("UPDATE users SET email_verified_at = '2026-01-01'");
		await markEmailChanged(db, 'acc', { email: 'new@x.sk', firstName: 'Janka', lastName: 'Nová' });
		expect(verified(sqlite, 'acc')).toBeNull();
		expect(sqlite.prepare("SELECT email, first_name, email_verified_at FROM users WHERE id = 'linked'").get())
			.toEqual({ email: 'new@x.sk', first_name: 'Janka', email_verified_at: null });
	});
});

describe('a password reset link also proves the mailbox', () => {
	it('verifies the address and joins the old venue accounts', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO organizations (id, name, slug) VALUES ('v2', 'Two', 'two');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', 'oldhash', 'J', 'N', 'client', 'v2')`);
		expect(await mailboxProven(db, 'acc')).toBe(1);
		expect(verified(sqlite, 'acc')).not.toBeNull();
		expect(verified(sqlite, 'old')).not.toBeNull();
		expect(sqlite.prepare("SELECT account_id FROM users WHERE id = 'old'").get()).toEqual({ account_id: 'acc' });
	});

	it('a venue-only account is just verified', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('solo', 'solo@x.sk', 'h', 'S', 'O', 'client', 'v1')`);
		expect(await mailboxProven(db, 'solo')).toBe(0);
		expect(verified(sqlite, 'solo')).not.toBeNull();
	});

	it('an email change spends reset links mailed to the old address', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ('r', 'acc', 'x', '2999-01-01')`);
		await markEmailChanged(db, 'acc', { email: 'new@x.sk', firstName: 'Jana', lastName: 'Nová' });
		expect(sqlite.prepare(`SELECT used FROM password_resets WHERE id = 'r'`).get()).toEqual({ used: 1 });
	});
});

describe('switch and gate', () => {
	it('is on only for an explicit yes', () => {
		expect(isOn(undefined)).toBe(false);
		expect(isOn('')).toBe(false);
		expect(isOn('0')).toBe(false);
		expect(isOn('true')).toBe(true);
		expect(isOn(' ON ')).toBe(true);
	});

	it('gates the console, not the personal pages', () => {
		expect(isGatedPath('/app/manage')).toBe(true);
		expect(isGatedPath('/app/manage/reservations')).toBe(true);
		expect(isGatedPath('/app/org/new')).toBe(true);
		expect(isGatedPath('/app/billing')).toBe(true);
		expect(isGatedPath('/app')).toBe(false);
		expect(isGatedPath('/app/profile')).toBe(false);
		expect(isGatedPath('/app/managers')).toBe(false);
	});
});

describe('the email', () => {
	it('escapes what it shows and links the button', () => {
		const { subject, html } = verificationEmail('sk', 'a<b>@x.sk', 'https://one.hallify.sk/verify-email/t', 'Kaštieľ <i>');
		expect(subject).toContain('Kaštieľ <i>');
		expect(html).toContain('https://one.hallify.sk/verify-email/t');
		expect(html).not.toContain('<b>@');
		expect(html).not.toContain('Kaštieľ <i>');
	});
});
