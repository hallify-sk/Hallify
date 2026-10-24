-- Migration 0042 — who a hall's cover photo comes from.
--
--   halls.cover_image_credit  the source or author of the cover photo, shown as a small
--                             caption on it ("Foto: www.example.sk"). Used for venues
--                             listed in the directory with their own photo, which must
--                             be credited. A URL is shown as its hostname, linked; any
--                             other text as it is. NULL = no caption.
--
-- Purely additive.

ALTER TABLE halls ADD COLUMN cover_image_credit TEXT;
