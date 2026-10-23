-- Migration 0031 — informational price, deposit and payment details on bookings (D6).
--
-- Hallify processes no payments: these columns only record what the venue agreed
-- with its client and how the client is to pay the venue directly. Additive only:
-- nullable columns, nothing existing changes. Safe on production data. D1 wraps the
-- file in its own transaction.
--
-- Amounts are cents. NULL means "not stated", which the pages show as nothing rather
-- than as 0 €.

-- The total the booking costs, as agreed. Staff-editable; the page suggests the
-- booked extras' total when it is empty.
ALTER TABLE reservations ADD COLUMN price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0);

-- The deposit and the date it is due (YYYY-MM-DD).
ALTER TABLE reservations ADD COLUMN deposit_cents INTEGER CHECK (deposit_cents IS NULL OR deposit_cents >= 0);
ALTER TABLE reservations ADD COLUMN deposit_due_date TEXT;

-- Payment instructions for this booking. The account and the note fall back to the
-- venue's defaults (org_settings key 'payment_defaults') when these are empty, so a
-- venue changing its account does not have to touch every booking.
ALTER TABLE reservations ADD COLUMN payment_iban TEXT;
ALTER TABLE reservations ADD COLUMN payment_variable_symbol TEXT;
ALTER TABLE reservations ADD COLUMN payment_note TEXT;

-- What the venue marked as received (informational; datetime('now') when marked).
ALTER TABLE reservations ADD COLUMN deposit_paid_at TEXT;
ALTER TABLE reservations ADD COLUMN paid_in_full_at TEXT;
