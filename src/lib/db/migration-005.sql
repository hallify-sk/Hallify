-- ─── migration-005: tie tickets to reservations ─────────────────────────────

-- Associate each support ticket with the reservation it relates to.
-- Nullable so existing tickets are preserved.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS reservation_id UUID REFERENCES reservations(id) ON DELETE SET NULL;
