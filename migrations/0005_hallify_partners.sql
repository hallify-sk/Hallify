-- Partner status is a platform designation, independent of subscription tiers.
-- Existing organizations are deliberately not inferred to be partners.
ALTER TABLE organizations ADD COLUMN is_hallify_partner INTEGER NOT NULL DEFAULT 0
CHECK (is_hallify_partner IN (0, 1));
