-- Migration: Remove any constraints and ensure fourchette columns are NUMERIC
-- This migration removes any CHECK constraints that might be enforcing integer type

BEGIN;

-- Check the current column definition
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns 
-- WHERE table_name = 'products' AND column_name IN ('fourchette_min', 'fourchette_max');

-- Remove any CHECK constraints on fourchette columns
ALTER TABLE products
DROP CONSTRAINT IF EXISTS fourchette_min_check,
DROP CONSTRAINT IF EXISTS fourchette_max_check,
DROP CONSTRAINT IF EXISTS products_fourchette_min_check,
DROP CONSTRAINT IF EXISTS products_fourchette_max_check;

-- Ensure columns are NUMERIC type (in case previous migration didn't work)
ALTER TABLE products
ALTER COLUMN fourchette_min TYPE NUMERIC(10, 2),
ALTER COLUMN fourchette_max TYPE NUMERIC(10, 2);

-- Set default values to NULL if not already set
ALTER TABLE products
ALTER COLUMN fourchette_min SET DEFAULT NULL,
ALTER COLUMN fourchette_max SET DEFAULT NULL;

COMMIT;
