import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';

const envMock = vi.hoisted(() => ({
	env: { BREVO_API_KEY: 'test-key', APP_URL: 'https://hallify.sk', HALLIFY_DOMAIN: 'hallify.sk' } as Record<string, string | undefined>,
}));
vi.mock('$env/dynamic/private', () => envMock);

import { testD1 } from './test-d1';
import { loadPaymentDefaults, loadPaymentView, markPayment, savePaymentDefaults, savePaymentDetails } from './payments';
import { notifyPaymentDetails, notifyStatusChange } from '$lib/email';
import { EMAIL_COPY } from './email-copy';

let db: D1Database;
let exec: (sql: string) => void;
let sent: Array<{ to: string; subject: string; html: string }>;

beforeEach(async () => {
	({ db, exec } = await testD1());
	exec(`
		INSERT INTO organizations (id, name, slug) VALUES ('org', 'Kaštieľ', 'kastiel'), ('other', 'Iná', 'ina');
		INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
			VALUES ('client', 'client@example.com', 'x', 'Jana', 'Nová', 'client', 'org');
		INSERT INTO halls (id, org_id, name, contact_email) VALUES ('hall', 'org', 'Veľká sála', 'sala@venue.sk');
		INSERT INTO reservations (id, org_id, hall_id, user_id, title, event_date, status, invite_code)
			VALUES ('res', 'org', 'hall', 'client', 'Svadba', '2027-05-22', 'pending', 'ABC');
	`);
	sent = [];
	vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
		const body = JSON.parse(init.body);
		sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent });
		return new Response('{}', { status: 201 });
	}));
});

afterEach(() => vi.unstubAllGlobals());

const details = {
	price_cents: 250000, deposit_cents: 50000, deposit_due_date: '2027-01-15',
	payment_iban: null, payment_variable_symbol: '2205', payment_note: null,
};

describe('payment details (D6)', () => {
	it('stores a booking\'s details only within its organisation', async () => {
		expect(await savePaymentDetails(db, 'other', 'res', details)).toBe(false);
		expect(await savePaymentDetails(db, 'org', 'res', details)).toBe(true);
		const view = await loadPaymentView(db, 'org', 'res');
		expect(view?.priceCents).toBe(250000);
		expect(view?.state).toBe('unpaid');
	});

	it('falls back to the venue\'s default account and note', async () => {
		await savePaymentDefaults(db, 'org', { iban: 'SK3112000000198742637541', bic: '', recipient: 'Kaštieľ s.r.o.', note: 'Uveďte meno.' });
		expect((await loadPaymentDefaults(db, 'org')).recipient).toBe('Kaštieľ s.r.o.');
		await savePaymentDetails(db, 'org', 'res', details);
		const view = await loadPaymentView(db, 'org', 'res');
		expect(view?.iban).toBe('SK3112000000198742637541');
		expect(view?.note).toBe('Uveďte meno.');
	});

	it('marks the deposit and the full payment, keeping the first date', async () => {
		await savePaymentDetails(db, 'org', 'res', details);
		await markPayment(db, 'org', 'res', 'deposit', true);
		const first = (await loadPaymentView(db, 'org', 'res'))!;
		expect(first.state).toBe('deposit_paid');
		expect(first.balanceCents).toBe(200000);
		exec("UPDATE reservations SET deposit_paid_at = '2026-01-01 10:00:00' WHERE id = 'res'");
		await markPayment(db, 'org', 'res', 'deposit', true);
		expect((await loadPaymentView(db, 'org', 'res'))!.depositPaidAt).toBe('2026-01-01 10:00:00');
		await markPayment(db, 'org', 'res', 'full', true);
		expect((await loadPaymentView(db, 'org', 'res'))!.state).toBe('paid');
		await markPayment(db, 'org', 'res', 'full', false);
		expect((await loadPaymentView(db, 'org', 'res'))!.state).toBe('deposit_paid');
	});

	it('puts the price and how to pay into the status email, with the note that Hallify collects nothing', async () => {
		await savePaymentDefaults(db, 'org', { iban: 'SK3112000000198742637541', bic: '', recipient: 'Kaštieľ s.r.o.', note: '' });
		await savePaymentDetails(db, 'org', 'res', details);
		await notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'waiting_payment', { reservationId: 'res' });
		expect(sent).toHaveLength(1);
		const html = sent[0].html;
		expect(html).toMatch(/2\s500,00\s€/);
		expect(html).toContain('SK31 1200 0000 1987 4263 7541');
		expect(html).toContain('2205');
		expect(html).toContain(EMAIL_COPY.sk.payment.waitingInfo);
		expect(html).toContain('Platbu nevyberá Hallify');
	});

	it('leaves the status email as it was when nothing is stated', async () => {
		await notifyStatusChange(db, 'org', 'client@example.com', 'Svadba', 'waiting_payment', { reservationId: 'res' });
		expect(sent[0].html).toContain(EMAIL_COPY.sk.statusInfo.waiting_payment);
		expect(sent[0].html).not.toContain('Platbu nevyberá Hallify');
	});

	it('sends the payment details on request, and nothing when there are none', async () => {
		expect(await notifyPaymentDetails(db, 'org', 'res')).toBe(false);
		await savePaymentDetails(db, 'org', 'res', details);
		expect(await notifyPaymentDetails(db, 'org', 'res')).toBe(true);
		expect(sent[0].subject).toBe('Platobné údaje: Svadba');
		expect(sent[0].to).toBe('client@example.com');
	});
});
