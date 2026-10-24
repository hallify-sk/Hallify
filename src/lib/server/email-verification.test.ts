import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
	createEmailVerification,
	findJoinLink,
	isGatedPath,
	joinOldAccounts,
	isOn,
	mailboxProven,
	markEmailChanged,
	venuesJoinedByReset,
	verificationEmail,
	verifyEmailToken,
	VERIFY_TTL_MS
} from './email-verification';
import { authenticateOnVenue } from './identity';
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
	it('verifies the account and its linked venue rows, but never joins old venue accounts by itself', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO organizations (id, name, slug) VALUES ('v2', 'Two', 'two');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', 'oldhash', 'J', 'N', 'client', 'v2')`);
		const token = await createEmailVerification(db, 'acc', 'jana@x.sk');
		const stored = sqlite.prepare('SELECT token FROM email_verifications').get() as { token: string };
		expect(stored.token).not.toBe(token);

		expect(await verifyEmailToken(db, token)).toEqual({ status: 'verified', userId: 'acc', email: 'jana@x.sk' });
		expect(verified(sqlite, 'acc')).not.toBeNull();
		expect(verified(sqlite, 'linked')).not.toBeNull();
		expect(sqlite.prepare("SELECT account_id, password_hash FROM users WHERE id = 'old'").get()).toEqual({ account_id: null, password_hash: 'oldhash' });
		// A second click is still a success.
		expect(await verifyEmailToken(db, token)).toEqual({ status: 'verified', userId: 'acc', email: 'jana@x.sk' });
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

describe('joining old venue accounts with a link', () => {
	// bcrypt stand-in: a "hash" is the password with a prefix.
	const compare = async (p: string, h: string) => h === `h:${p}`;

	function withOldAccount() {
		const { sqlite, db } = setup();
		sqlite.exec(`UPDATE users SET password_hash = 'h:hallify' WHERE id = 'acc';
			INSERT INTO organizations (id, name, slug) VALUES ('v2', 'Venue Two', 'two');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', 'h:old', 'J', 'N', 'client', 'v2');
			INSERT INTO sessions (id, user_id, expires_at) VALUES ('s-old', 'old', '2999-01-01T00:00:00.000Z')`);
		return { sqlite, db };
	}
	const accountOf = (sqlite: ReturnType<typeof migratedSqlite>) =>
		(sqlite.prepare("SELECT account_id FROM users WHERE id = 'old'").get() as { account_id: string | null }).account_id;

	it('names the venues, and joins them only with the Hallify password', async () => {
		const { sqlite, db } = withOldAccount();
		const token = await createEmailVerification(db, 'acc', 'jana@x.sk');
		await verifyEmailToken(db, token);

		const link = await findJoinLink(db, token);
		expect(link).toMatchObject({ status: 'ok', venues: ['Venue Two'] });
		if (link.status !== 'ok') return;

		// The mailbox alone (no password, a wrong one, the old venue password) joins nothing.
		expect(await joinOldAccounts(db, link.account, {}, compare)).toEqual({ ok: false });
		expect(await joinOldAccounts(db, link.account, { password: 'old' }, compare)).toEqual({ ok: false });
		expect(await joinOldAccounts(db, link.account, { signedInAs: 'someone-else', password: '' }, compare)).toEqual({ ok: false });
		expect(accountOf(sqlite)).toBeNull();

		expect(await joinOldAccounts(db, link.account, { password: 'hallify' }, compare)).toEqual({ ok: true, joined: 1 });
		expect(accountOf(sqlite)).toBe('acc');
		expect(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'old'").get()).toEqual({ n: 0 });
		expect(await findJoinLink(db, token)).toMatchObject({ status: 'ok', venues: [] });
	});

	it('a session of the account counts as holding it', async () => {
		const { sqlite, db } = withOldAccount();
		const token = await createEmailVerification(db, 'acc', 'jana@x.sk');
		const link = await findJoinLink(db, token);
		if (link.status !== 'ok') throw new Error(link.status);
		expect(await joinOldAccounts(db, link.account, { signedInAs: 'acc' }, compare)).toEqual({ ok: true, joined: 1 });
		expect(accountOf(sqlite)).toBe('acc');
		expect(verified(sqlite, 'acc')).not.toBeNull();
	});

	it('an account made with someone else\'s address cannot take their old venue account', async () => {
		// The attacker signs up with the victim's address and a password of their own,
		// then has the "join" link mailed to the victim, who opens it.
		const { sqlite, db } = withOldAccount();
		const token = await createEmailVerification(db, 'acc', 'jana@x.sk');
		expect(await verifyEmailToken(db, token)).toMatchObject({ status: 'verified' });
		expect(accountOf(sqlite)).toBeNull();
		// The victim's own venue password still opens their account; the attacker's does not.
		expect(await authenticateOnVenue(db, 'v2', 'jana@x.sk', 'old', compare)).toEqual({ kind: 'client', userId: 'old' });
		expect(await authenticateOnVenue(db, 'v2', 'jana@x.sk', 'hallify', compare)).toEqual({ kind: 'separate', accountId: 'acc' });
		// And the victim, who does not know the attacker's password, cannot join it by mistake.
		const link = await findJoinLink(db, token);
		if (link.status !== 'ok') throw new Error(link.status);
		expect(await joinOldAccounts(db, link.account, { password: 'old' }, compare)).toEqual({ ok: false });
		expect(accountOf(sqlite)).toBeNull();
	});

	it('refuses unknown, expired, stale and venue-account links', async () => {
		const { sqlite, db } = withOldAccount();
		expect(await findJoinLink(db, 'nope')).toEqual({ status: 'invalid' });
		const old = await createEmailVerification(db, 'acc', 'jana@x.sk', Date.now() - VERIFY_TTL_MS - 1000);
		expect(await findJoinLink(db, old)).toEqual({ status: 'expired' });
		const venueRow = await createEmailVerification(db, 'old', 'jana@x.sk');
		expect(await findJoinLink(db, venueRow)).toEqual({ status: 'invalid' });
		const before = await createEmailVerification(db, 'acc', 'jana@x.sk');
		await markEmailChanged(db, 'acc', { email: 'new@x.sk', firstName: 'Jana', lastName: 'Nová' });
		expect(await findJoinLink(db, before)).toEqual({ status: 'stale' });
		expect(accountOf(sqlite)).toBeNull();
	});
});

describe('a password reset link also proves the mailbox', () => {
	it('verifies the address and joins the old venue accounts', async () => {
		const { sqlite, db } = setup();
		sqlite.exec(`INSERT INTO organizations (id, name, slug) VALUES ('v2', 'Two', 'two');
			INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('old', 'jana@x.sk', 'oldhash', 'J', 'N', 'client', 'v2')`);
		expect(await venuesJoinedByReset(db, 'acc')).toEqual(['Two']);
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

	it('a join link says it joins an older account, and how to take the account back', () => {
		const { subject, html } = verificationEmail('en', 'jana@x.sk', 'https://one.hallify.sk/verify-email/t', 'One', 'join');
		expect(subject).toBe('Join your older account – One');
		expect(html).toContain('join the older account for <strong>jana@x.sk</strong>');
		expect(html).toContain('Join the older account');
		expect(html).toContain('Forgot Password');
		expect(verificationEmail('sk', 'jana@x.sk', 'u', 'One').subject).toBe('Potvrďte svoj e-mail – One');
	});
});
