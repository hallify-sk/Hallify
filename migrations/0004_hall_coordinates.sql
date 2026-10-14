-- Existing public halls remain visible in the directory. Operators opt into map
-- placement by saving a coordinate pair; addresses are not guessed/geocoded.
ALTER TABLE halls ADD COLUMN latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE halls ADD COLUMN longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);

CREATE INDEX IF NOT EXISTS idx_halls_public_location
ON halls(is_public, plan_locked, latitude, longitude);
