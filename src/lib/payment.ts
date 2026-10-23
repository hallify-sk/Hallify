// Price, deposit and payment details of a booking (D6). Purely informational:
// Hallify processes no payments, it only records what the venue agreed with its
// client and tells the client how to pay the venue directly.
//
// The columns live on reservations (migration 0031); the venue's default account and
// note live in org_settings under 'payment_defaults'. A booking's own account or note
// wins; when it has none, the venue's default is shown. Shared by the console, the
// venue site and the emails, so nothing here touches the database.

/** The venue's default payment instructions (Settings → Payments). */
export interface PaymentDefaults {
	/** Account number as IBAN, stored without spaces. */
	iban: string;
	/** Optional BIC/SWIFT, for clients paying from abroad. */
	bic: string;
	/** Account holder, as the client should type it into their bank. */
	recipient: string;
	/** Free text shown under the instructions (e.g. "Uveďte meno a dátum podujatia"). */
	note: string;
}

export const EMPTY_PAYMENT_DEFAULTS: PaymentDefaults = { iban: '', bic: '', recipient: '', note: '' };

/** The payment columns of a reservation, as stored. */
export interface PaymentRow {
	price_cents: number | null;
	deposit_cents: number | null;
	deposit_due_date: string | null;
	payment_iban: string | null;
	payment_variable_symbol: string | null;
	payment_note: string | null;
	deposit_paid_at: string | null;
	paid_in_full_at: string | null;
}

export const EMPTY_PAYMENT_ROW: PaymentRow = {
	price_cents: null, deposit_cents: null, deposit_due_date: null,
	payment_iban: null, payment_variable_symbol: null, payment_note: null,
	deposit_paid_at: null, paid_in_full_at: null,
};

export type PaymentState = 'none' | 'unpaid' | 'deposit_paid' | 'paid';

/** What a page or an email shows: the booking's details with the venue's defaults
 *  filled in where the booking states nothing of its own. */
export interface PaymentView {
	priceCents: number | null;
	depositCents: number | null;
	depositDueDate: string | null;
	iban: string | null;
	bic: string | null;
	recipient: string | null;
	variableSymbol: string | null;
	note: string | null;
	depositPaidAt: string | null;
	paidInFullAt: string | null;
	/** What is still to pay: the price less a received deposit. Null when the price is
	 *  not stated or everything is paid. */
	balanceCents: number | null;
	state: PaymentState;
	/** A price or a deposit is stated. */
	hasAmounts: boolean;
	/** An account to pay to is known. */
	hasInstructions: boolean;
	/** Anything at all worth showing. */
	hasAny: boolean;
}

/** Largest amount accepted, in cents (10 million €): a typo guard, not a business rule. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;
export const PAYMENT_NOTE_MAX = 1000;
export const RECIPIENT_MAX = 140;

const blank = (v: string | null | undefined) => (v ?? '').trim() === '';
const orNull = (v: string | null | undefined) => (blank(v) ? null : (v as string).trim());

export function resolvePayment(row: Partial<PaymentRow> | null | undefined, defaults: PaymentDefaults = EMPTY_PAYMENT_DEFAULTS): PaymentView {
	const r = { ...EMPTY_PAYMENT_ROW, ...(row ?? {}) };
	const price = r.price_cents ?? null;
	const deposit = r.deposit_cents ?? null;
	const ownIban = orNull(r.payment_iban);
	const iban = ownIban ?? orNull(defaults.iban);
	// The BIC and holder belong to the venue's account: shown only with that account.
	const bic = ownIban ? null : orNull(defaults.bic);
	const recipient = orNull(defaults.recipient);
	const note = orNull(r.payment_note) ?? orNull(defaults.note);
	const depositPaidAt = r.deposit_paid_at ?? null;
	const paidInFullAt = r.paid_in_full_at ?? null;

	const state: PaymentState = paidInFullAt ? 'paid'
		: depositPaidAt ? 'deposit_paid'
		: price != null || deposit != null ? 'unpaid'
		: 'none';

	let balance: number | null = null;
	if (price != null && !paidInFullAt) {
		balance = Math.max(0, price - (depositPaidAt && deposit != null ? deposit : 0));
	}

	const hasAmounts = price != null || deposit != null;
	const hasInstructions = !!iban;
	return {
		priceCents: price,
		depositCents: deposit,
		depositDueDate: orNull(r.deposit_due_date),
		iban,
		bic,
		recipient,
		variableSymbol: orNull(r.payment_variable_symbol),
		note,
		depositPaidAt,
		paidInFullAt,
		balanceCents: balance,
		state,
		hasAmounts,
		hasInstructions,
		hasAny: hasAmounts || hasInstructions || !!note || !!orNull(r.payment_variable_symbol),
	};
}

/** The price offered while a booking states none: the hall's base price plus the
 *  booked extras. Null when neither is known. */
export function suggestedPrice(hallBaseCents: number | null | undefined, extrasCents: number | null | undefined): number | null {
	const base = hallBaseCents ?? null;
	const extras = extrasCents && extrasCents > 0 ? extrasCents : null;
	if (base == null && extras == null) return null;
	return (base ?? 0) + (extras ?? 0);
}

/** The deposit's due date has passed and nothing has been marked as received. */
export function depositOverdue(view: PaymentView, todayISO: string): boolean {
	return !!view.depositDueDate && view.depositCents != null && !view.depositPaidAt && !view.paidInFullAt
		&& view.depositDueDate < todayISO;
}

// ── Parsing what people type ─────────────────────────────────────────────────

/**
 * An amount in euros as typed, to cents. Accepts "1200", "1 200", "1200,50",
 * "1 200,5 €", "1.200,50", "1200.50". Empty is "not stated" (null).
 * Returns undefined when the text is not an amount.
 */
export function parseAmount(raw: string | null | undefined): number | null | undefined {
	let s = String(raw ?? '').replace(/[\s  €]/g, '').replace(/eur$/i, '');
	if (s === '') return null;
	if (!/^\d[\d.,]*$/.test(s)) return undefined;
	const lastComma = s.lastIndexOf(',');
	const lastDot = s.lastIndexOf('.');
	if (lastComma >= 0 && lastDot >= 0) {
		// Both used: the later one is the decimal separator, the other groups thousands.
		const dec = lastComma > lastDot ? ',' : '.';
		const group = dec === ',' ? '.' : ',';
		s = s.split(group).join('');
		if (s.split(dec).length > 2) return undefined;
		s = s.replace(dec, '.');
	} else if (lastComma >= 0) {
		const parts = s.split(',');
		if (parts.length > 2) {
			// "1,200,000": grouping commas.
			if (!parts.slice(1).every((p) => p.length === 3)) return undefined;
			s = parts.join('');
		} else {
			s = s.replace(',', '.');
		}
	} else if (lastDot >= 0) {
		const parts = s.split('.');
		// "1.200" or "1.200.000": Slovak thousands grouping. "12.50": a decimal point.
		if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
			if (!parts.slice(1).every((p) => p.length === 3)) return undefined;
			s = parts.join('');
		}
	}
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0) return undefined;
	const [, frac = ''] = s.split('.');
	if (frac.length > 2) return undefined;
	const cents = Math.round(n * 100);
	return cents > MAX_AMOUNT_CENTS ? undefined : cents;
}

/** Cents as the amount field shows them for editing: "1200" or "1200,50" (sk) / "1200.50" (en). */
export function amountInputValue(cents: number | null | undefined, locale: string = 'sk'): string {
	if (cents == null) return '';
	const whole = Math.floor(cents / 100);
	const rest = cents % 100;
	if (rest === 0) return String(whole);
	return `${whole}${locale === 'en' ? '.' : ','}${String(rest).padStart(2, '0')}`;
}

/** An IBAN without spaces, upper-cased. */
export function normaliseIban(raw: string | null | undefined): string {
	return String(raw ?? '').replace(/[\s -]/g, '').toUpperCase();
}

/** ISO 13616 shape and the mod-97 check, so a mistyped digit is caught before a client
 *  sends money to it. */
export function isValidIban(raw: string | null | undefined): boolean {
	const iban = normaliseIban(raw);
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
	const rearranged = iban.slice(4) + iban.slice(0, 4);
	let remainder = 0;
	for (const ch of rearranged) {
		const code = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
		for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
	}
	return remainder === 1;
}

/** "SK31 1200 0000 1987 4263 7541": groups of four, as banks print it. */
export function formatIban(raw: string | null | undefined): string {
	return normaliseIban(raw).replace(/(.{4})(?=.)/g, '$1 ');
}

/** Slovak/Czech variable symbol: up to 10 digits. */
export function isValidVariableSymbol(raw: string | null | undefined): boolean {
	return /^\d{1,10}$/.test(String(raw ?? '').trim());
}

export function normaliseBic(raw: string | null | undefined): string {
	return String(raw ?? '').replace(/\s/g, '').toUpperCase();
}

export function isValidBic(raw: string | null | undefined): boolean {
	return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(normaliseBic(raw));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PaymentField = 'price' | 'deposit' | 'depositDue' | 'iban' | 'variableSymbol' | 'note' | 'depositOverPrice';

/** The staff form's fields, validated. Every field may be left empty. */
export function parsePaymentForm(input: {
	price?: string | null; deposit?: string | null; depositDue?: string | null;
	iban?: string | null; variableSymbol?: string | null; note?: string | null;
}):
	| { ok: true; values: Pick<PaymentRow, 'price_cents' | 'deposit_cents' | 'deposit_due_date' | 'payment_iban' | 'payment_variable_symbol' | 'payment_note'> }
	| { ok: false; field: PaymentField } {
	const price = parseAmount(input.price);
	if (price === undefined) return { ok: false, field: 'price' };
	const deposit = parseAmount(input.deposit);
	if (deposit === undefined) return { ok: false, field: 'deposit' };
	if (price != null && deposit != null && deposit > price) return { ok: false, field: 'depositOverPrice' };
	const due = String(input.depositDue ?? '').trim();
	if (due && !ISO_DATE.test(due)) return { ok: false, field: 'depositDue' };
	const iban = normaliseIban(input.iban);
	if (iban && !isValidIban(iban)) return { ok: false, field: 'iban' };
	const vs = String(input.variableSymbol ?? '').trim();
	if (vs && !isValidVariableSymbol(vs)) return { ok: false, field: 'variableSymbol' };
	const note = String(input.note ?? '').trim();
	if (note.length > PAYMENT_NOTE_MAX) return { ok: false, field: 'note' };
	return {
		ok: true,
		values: {
			price_cents: price,
			deposit_cents: deposit,
			deposit_due_date: due || null,
			payment_iban: iban || null,
			payment_variable_symbol: vs || null,
			payment_note: note || null,
		},
	};
}

export type DefaultsField = 'iban' | 'bic' | 'recipient' | 'note';

/** The venue's defaults, validated. */
export function parsePaymentDefaults(input: { iban?: string | null; bic?: string | null; recipient?: string | null; note?: string | null }):
	| { ok: true; values: PaymentDefaults }
	| { ok: false; field: DefaultsField } {
	const iban = normaliseIban(input.iban);
	if (iban && !isValidIban(iban)) return { ok: false, field: 'iban' };
	const bic = normaliseBic(input.bic);
	if (bic && !isValidBic(bic)) return { ok: false, field: 'bic' };
	const recipient = String(input.recipient ?? '').trim();
	if (recipient.length > RECIPIENT_MAX) return { ok: false, field: 'recipient' };
	const note = String(input.note ?? '').trim();
	if (note.length > PAYMENT_NOTE_MAX) return { ok: false, field: 'note' };
	return { ok: true, values: { iban, bic, recipient, note } };
}

/** Stored defaults (a JSON object) read leniently: anything malformed is empty. */
export function readPaymentDefaults(raw: unknown): PaymentDefaults {
	let v: unknown = raw;
	if (typeof raw === 'string') {
		try { v = JSON.parse(raw); } catch { return { ...EMPTY_PAYMENT_DEFAULTS }; }
	}
	if (!v || typeof v !== 'object') return { ...EMPTY_PAYMENT_DEFAULTS };
	const o = v as Record<string, unknown>;
	const str = (x: unknown) => (typeof x === 'string' ? x : '');
	return { iban: str(o.iban), bic: str(o.bic), recipient: str(o.recipient), note: str(o.note) };
}
