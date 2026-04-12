-- Migration: Convert fourchette columns from INTEGER to NUMERIC(10,2)
-- This is the definitive fix for the type mismatch issue

BEGIN;

-- Convert fourchette_min from INTEGER to NUMERIC(10,2)
ALTER TABLE products
ALTER COLUMN fourchette_min TYPE NUMERIC(10, 2) USING fourchette_min::NUMERIC(10, 2);

-- Convert fourchette_max from INTEGER to NUMERIC(10,2)
ALTER TABLE products
ALTER COLUMN fourchette_max TYPE NUMERIC(10, 2) USING fourchette_max::NUMERIC(10, 2);

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
AND column_name IN ('fourchette_min', 'fourchette_max');

COMMIT;
