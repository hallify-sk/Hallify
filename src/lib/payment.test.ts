import { describe, expect, it } from 'vitest';
import {
	amountInputValue, depositOverdue, formatIban, isValidIban, isValidVariableSymbol, parseAmount,
	parsePaymentDefaults, parsePaymentForm, readPaymentDefaults, resolvePayment,
} from './payment';

describe('parseAmount', () => {
	it('reads the ways people type euros', () => {
		expect(parseAmount('1200')).toBe(120000);
		expect(parseAmount('1 200')).toBe(120000);
		expect(parseAmount('1 200,50 €')).toBe(120050);
		expect(parseAmount('1200,5')).toBe(120050);
		expect(parseAmount('1.200,50')).toBe(120050);
		expect(parseAmount('1,200.50')).toBe(120050);
		expect(parseAmount('12.50')).toBe(1250);
		expect(parseAmount('1.200')).toBe(120000);
		expect(parseAmount('0')).toBe(0);
	});

	it('treats empty as not stated and junk as invalid', () => {
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('   ')).toBeNull();
		expect(parseAmount(null)).toBeNull();
		expect(parseAmount('abc')).toBeUndefined();
		expect(parseAmount('-5')).toBeUndefined();
		expect(parseAmount('1,2345')).toBeUndefined();
		expect(parseAmount('99999999999')).toBeUndefined();
	});

	it('round-trips through the edit value', () => {
		expect(amountInputValue(120050, 'sk')).toBe('1200,50');
		expect(amountInputValue(120000, 'sk')).toBe('1200');
		expect(amountInputValue(120005, 'en')).toBe('1200.05');
		expect(parseAmount(amountInputValue(120005, 'sk'))).toBe(120005);
		expect(amountInputValue(null)).toBe('');
	});
});

describe('IBAN and variable symbol', () => {
	it('checks the IBAN checksum, ignoring spaces and case', () => {
		expect(isValidIban('SK31 1200 0000 1987 4263 7541')).toBe(true);
		expect(isValidIban('sk3112000000198742637541')).toBe(true);
		expect(isValidIban('DE89370400440532013000')).toBe(true);
		expect(isValidIban('SK31 1200 0000 1987 4263 7542')).toBe(false);
		expect(isValidIban('1234')).toBe(false);
	});

	it('prints an IBAN in groups of four', () => {
		expect(formatIban('SK3112000000198742637541')).toBe('SK31 1200 0000 1987 4263 7541');
	});

	it('accepts a variable symbol of up to ten digits', () => {
		expect(isValidVariableSymbol('2026102301')).toBe(true);
		expect(isValidVariableSymbol('12345678901')).toBe(false);
		expect(isValidVariableSymbol('12a')).toBe(false);
	});
});

describe('resolvePayment', () => {
	const defaults = { iban: 'SK3112000000198742637541', bic: 'TATRSKBX', recipient: 'Kaštieľ s.r.o.', note: 'Uveďte meno.' };

	it('shows nothing for a booking without details at a venue without defaults', () => {
		const v = resolvePayment(null);
		expect(v.hasAny).toBe(false);
		expect(v.state).toBe('none');
	});

	it('fills the venue defaults in where the booking states nothing', () => {
		const v = resolvePayment({ price_cents: 200000 }, defaults);
		expect(v.iban).toBe(defaults.iban);
		expect(v.bic).toBe('TATRSKBX');
		expect(v.recipient).toBe('Kaštieľ s.r.o.');
		expect(v.note).toBe('Uveďte meno.');
		expect(v.state).toBe('unpaid');
		expect(v.balanceCents).toBe(200000);
	});

	it('lets the booking override the account (without the default BIC) and the note', () => {
		const v = resolvePayment({ payment_iban: 'DE89370400440532013000', payment_note: 'Iný účet' }, defaults);
		expect(v.iban).toBe('DE89370400440532013000');
		expect(v.bic).toBeNull();
		expect(v.note).toBe('Iný účet');
	});

	it('subtracts a received deposit and settles when paid in full', () => {
		const row = { price_cents: 200000, deposit_cents: 50000, deposit_paid_at: '2026-10-01 10:00:00' };
		expect(resolvePayment(row).state).toBe('deposit_paid');
		expect(resolvePayment(row).balanceCents).toBe(150000);
		const paid = resolvePayment({ ...row, paid_in_full_at: '2026-10-05 10:00:00' });
		expect(paid.state).toBe('paid');
		expect(paid.balanceCents).toBeNull();
	});

	it('knows when a deposit is overdue', () => {
		const v = resolvePayment({ deposit_cents: 50000, deposit_due_date: '2026-10-01' });
		expect(depositOverdue(v, '2026-10-02')).toBe(true);
		expect(depositOverdue(v, '2026-10-01')).toBe(false);
		expect(depositOverdue(resolvePayment({ deposit_cents: 50000, deposit_due_date: '2026-10-01', deposit_paid_at: 'x' }), '2026-10-02')).toBe(false);
	});
});

describe('parsePaymentForm', () => {
	it('accepts an all-empty form as "nothing stated"', () => {
		const r = parsePaymentForm({});
		expect(r).toEqual({ ok: true, values: {
			price_cents: null, deposit_cents: null, deposit_due_date: null,
			payment_iban: null, payment_variable_symbol: null, payment_note: null,
		} });
	});

	it('normalises what it keeps', () => {
		const r = parsePaymentForm({ price: '2 000', deposit: '500', depositDue: '2026-11-01', iban: 'sk31 1200 0000 1987 4263 7541', variableSymbol: ' 123 ', note: ' Ďakujeme ' });
		expect(r.ok && r.values).toEqual({
			price_cents: 200000, deposit_cents: 50000, deposit_due_date: '2026-11-01',
			payment_iban: 'SK3112000000198742637541', payment_variable_symbol: '123', payment_note: 'Ďakujeme',
		});
	});

	it('names the field that is wrong', () => {
		expect(parsePaymentForm({ price: 'x' })).toEqual({ ok: false, field: 'price' });
		expect(parsePaymentForm({ price: '100', deposit: '200' })).toEqual({ ok: false, field: 'depositOverPrice' });
		expect(parsePaymentForm({ depositDue: '1.11.2026' })).toEqual({ ok: false, field: 'depositDue' });
		expect(parsePaymentForm({ iban: 'SK00' })).toEqual({ ok: false, field: 'iban' });
		expect(parsePaymentForm({ variableSymbol: 'ABC' })).toEqual({ ok: false, field: 'variableSymbol' });
	});
});

describe('payment defaults', () => {
	it('validates and reads back leniently', () => {
		expect(parsePaymentDefaults({ iban: 'SK00 1234' })).toEqual({ ok: false, field: 'iban' });
		expect(parsePaymentDefaults({ bic: 'x' })).toEqual({ ok: false, field: 'bic' });
		const ok = parsePaymentDefaults({ iban: 'sk3112000000198742637541', bic: 'tatrskbx', recipient: ' Kaštieľ ', note: '' });
		expect(ok).toEqual({ ok: true, values: { iban: 'SK3112000000198742637541', bic: 'TATRSKBX', recipient: 'Kaštieľ', note: '' } });
		expect(readPaymentDefaults('{"iban":"SK31","note":5}')).toEqual({ iban: 'SK31', bic: '', recipient: '', note: '' });
		expect(readPaymentDefaults('not json')).toEqual({ iban: '', bic: '', recipient: '', note: '' });
	});
});
