// Reading and writing a booking's informational price and payment details (D6), and
// the venue's default payment instructions. See $lib/payment for the rules.
//
// Every read tolerates a database where migration 0031 has not run yet: the page then
// simply shows no payment block, rather than failing.

import { dbFirst, dbRun } from '$lib/db/index';
import {
	EMPTY_PAYMENT_DEFAULTS, readPaymentDefaults, resolvePayment,
	type PaymentDefaults, type PaymentRow, type PaymentView,
} from '$lib/payment';
import type { D1Database } from '@cloudflare/workers-types';

export const PAYMENT_DEFAULTS_KEY = 'payment_defaults';

const COLUMNS = 'price_cents, deposit_cents, deposit_due_date, payment_iban, payment_variable_symbol, payment_note, deposit_paid_at, paid_in_full_at';

export async function loadPaymentDefaults(db: D1Database, orgId: string): Promise<PaymentDefaults> {
	try {
		const row = await dbFirst<{ value: string | null }>(db,
			'SELECT value FROM org_settings WHERE org_id = ? AND key = ?', orgId, PAYMENT_DEFAULTS_KEY);
		return row ? readPaymentDefaults(row.value) : { ...EMPTY_PAYMENT_DEFAULTS };
	} catch {
		return { ...EMPTY_PAYMENT_DEFAULTS };
	}
}

export async function savePaymentDefaults(db: D1Database, orgId: string, values: PaymentDefaults): Promise<void> {
	await dbRun(db,
		`INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))`,
		orgId, PAYMENT_DEFAULTS_KEY, JSON.stringify(values));
}

/** The booking's payment columns, or null when the booking (or the migration) is missing. */
export async function loadPaymentRow(db: D1Database, reservationId: string): Promise<PaymentRow | null> {
	try {
		return await dbFirst<PaymentRow>(db, `SELECT ${COLUMNS} FROM reservations WHERE id = ?`, reservationId);
	} catch {
		return null;
	}
}

/** The booking's payment details with the venue's defaults filled in. */
export async function loadPaymentView(db: D1Database, orgId: string, reservationId: string): Promise<PaymentView | null> {
	const row = await loadPaymentRow(db, reservationId);
	if (!row) return null;
	return resolvePayment(row, await loadPaymentDefaults(db, orgId));
}

/** Whether payment details can be stored here (migration 0031 has run). */
export async function paymentsAvailable(db: D1Database): Promise<boolean> {
	try {
		await dbFirst(db, 'SELECT price_cents FROM reservations LIMIT 1');
		return true;
	} catch {
		return false;
	}
}

export type PaymentValues = Pick<PaymentRow, 'price_cents' | 'deposit_cents' | 'deposit_due_date' | 'payment_iban' | 'payment_variable_symbol' | 'payment_note'>;

/** Store the staff form. Returns false when the booking is not this organisation's. */
export async function savePaymentDetails(db: D1Database, orgId: string, reservationId: string, v: PaymentValues): Promise<boolean> {
	const r = await dbRun(db,
		`UPDATE reservations
		    SET price_cents = ?, deposit_cents = ?, deposit_due_date = ?,
		        payment_iban = ?, payment_variable_symbol = ?, payment_note = ?
		  WHERE id = ? AND org_id = ?`,
		v.price_cents, v.deposit_cents, v.deposit_due_date, v.payment_iban, v.payment_variable_symbol, v.payment_note,
		reservationId, orgId);
	return (r.meta?.changes ?? 1) > 0;
}

export type PaymentMark = 'deposit' | 'full';

/** Mark (or unmark) the deposit or the whole amount as received. Informational only. */
export async function markPayment(db: D1Database, orgId: string, reservationId: string, which: PaymentMark, received: boolean): Promise<boolean> {
	const column = which === 'deposit' ? 'deposit_paid_at' : 'paid_in_full_at';
	const r = await dbRun(db,
		`UPDATE reservations SET ${column} = ${received ? "COALESCE(" + column + ", datetime('now'))" : 'NULL'}
		  WHERE id = ? AND org_id = ?`,
		reservationId, orgId);
	return (r.meta?.changes ?? 1) > 0;
}
