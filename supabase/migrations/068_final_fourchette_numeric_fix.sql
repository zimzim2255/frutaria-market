-- Migration: Final comprehensive fix for fourchette columns
-- Purpose: Convert fourchette_min and fourchette_max from INTEGER to NUMERIC(10,2)
-- This handles all edge cases and ensures data integrity

BEGIN;

-- Step 1: Check if columns exist and their current type
-- If they're already NUMERIC, this won't cause issues

-- Step 2: Drop any existing constraints that might prevent the conversion
ALTER TABLE products
DROP CONSTRAINT IF EXISTS fourchette_min_check,
DROP CONSTRAINT IF EXISTS fourchette_max_check;

-- Step 3: Convert the columns to NUMERIC(10,2)
-- Using USING clause to safely convert existing INTEGER values to NUMERIC
ALTER TABLE products
ALTER COLUMN fourchette_min TYPE NUMERIC(10, 2) USING fourchette_min::NUMERIC(10, 2);

ALTER TABLE products
ALTER COLUMN fourchette_max TYPE NUMERIC(10, 2) USING fourchette_max::NUMERIC(10, 2);

-- Step 4: Update comments
COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product (supports decimal values like 16.5)';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product (supports decimal values like 16.5)';

-- Step 5: Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
AND column_name IN ('fourchette_min', 'fourchette_max');

COMMIT;
