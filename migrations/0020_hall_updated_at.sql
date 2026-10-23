-- Halls record when they last changed, so sitemaps can give search engines a real
-- <lastmod> instead of the creation date (or none at all).
--
-- Additive and safe on live data: a nullable column, back-filled from created_at,
-- and kept current by triggers so no existing UPDATE statement has to change.
-- ALTER TABLE cannot add a column with a datetime('now') default, hence the triggers.

ALTER TABLE halls ADD COLUMN updated_at TEXT;

UPDATE halls SET updated_at = created_at WHERE updated_at IS NULL;

-- Any change to a hall stamps it. An UPDATE that sets updated_at itself is left
-- alone, and the "older than now" guard means the trigger's own UPDATE can never
-- fire it again, even with recursive triggers enabled.
CREATE TRIGGER IF NOT EXISTS halls_touch_updated_at
AFTER UPDATE ON halls
FOR EACH ROW
WHEN NEW.updated_at IS OLD.updated_at
  AND (OLD.updated_at IS NULL OR OLD.updated_at < datetime('now'))
BEGIN
  UPDATE halls SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- New halls start with their creation time.
CREATE TRIGGER IF NOT EXISTS halls_insert_updated_at
AFTER INSERT ON halls
FOR EACH ROW
WHEN NEW.updated_at IS NULL
BEGIN
  UPDATE halls SET updated_at = COALESCE(NEW.created_at, datetime('now')) WHERE id = NEW.id;
END;
