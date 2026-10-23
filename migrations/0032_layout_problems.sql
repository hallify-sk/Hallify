-- Hall-plan changes flow into templates and upcoming events (D2).
--
-- When a hall's floor plan is saved, its room is laid under every template of the
-- hall and every upcoming event's layout, and each is checked: a table or chair in
-- a wall or a pillar, off the floor, or on a floor the hall no longer has. What is
-- wrong is stored here as a JSON list ([{ id, item, kind, tag, floor }]), NULL when
-- nothing is. Saving a fixed layout clears it.
--
-- Additive and nullable: existing rows read as "no problems" until the next save
-- of their hall's plan checks them.

ALTER TABLE floorplan_templates ADD COLUMN layout_problems TEXT;
ALTER TABLE reservations ADD COLUMN layout_problems TEXT;
