-- Migration 0037 — what Hallify tells and hands over on a mapping request (M25).
--
-- "We map your venue for you" (0008) had a status and nothing else: moving it to
-- delivered delivered nothing, and the operator was never told it had moved. Now
-- each status change can carry a message to the operator, and delivery a file (the
-- measured plan as a PDF or a picture) when the plan was not drawn straight into
-- the hall's editor. The file lives in private storage (never under /uploads) and
-- is downloaded through the hall page by the organisation's own members.
--
-- Purely additive: nullable columns, no rewrite of existing rows.

ALTER TABLE floorplan_requests ADD COLUMN reply_note TEXT;
ALTER TABLE floorplan_requests ADD COLUMN delivery_file_key TEXT;
ALTER TABLE floorplan_requests ADD COLUMN delivery_file_name TEXT;
ALTER TABLE floorplan_requests ADD COLUMN delivery_file_type TEXT;
