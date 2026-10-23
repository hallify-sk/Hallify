-- Migration 0031a — a hall's informational base price (D6).
--
-- The price a hall is usually let for, in cents. Staff see it, with the booked
-- extras, as the suggested total when they fill in a booking's price; it is never
-- charged and never shown to clients on its own. NULL = not stated.
--
-- Additive only: one nullable column. Safe on production data.
ALTER TABLE halls ADD COLUMN base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= 0);
