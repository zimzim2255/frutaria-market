-- Migration: Final comprehensive fix for fourchette columns
-- This migration will completely reset the fourchette columns to NUMERIC type
-- and remove any constraints that might be causing the integer type error

BEGIN;

-- Step 1: Drop any existing constraints
ALTER TABLE products
DROP CONSTRAINT IF EXISTS fourchette_min_check CASCADE,
DROP CONSTRAINT IF EXISTS fourchette_max_check CASCADE,
DROP CONSTRAINT IF EXISTS products_fourchette_min_check CASCADE,
DROP CONSTRAINT IF EXISTS products_fourchette_max_check CASCADE;

-- Step 2: Drop and recreate the columns to ensure they are NUMERIC
ALTER TABLE products
DROP COLUMN IF EXISTS fourchette_min CASCADE,
DROP COLUMN IF EXISTS fourchette_max CASCADE;

-- Step 3: Add the columns back as NUMERIC(10, 2) type
ALTER TABLE products
ADD COLUMN fourchette_min NUMERIC(10, 2),
ADD COLUMN fourchette_max NUMERIC(10, 2);

-- Step 4: Drop old indexes if they exist
DROP INDEX IF EXISTS idx_products_fourchette_min CASCADE;
DROP INDEX IF EXISTS idx_products_fourchette_max CASCADE;

-- Step 5: Create new indexes
CREATE INDEX idx_products_fourchette_min ON products(fourchette_min);
CREATE INDEX idx_products_fourchette_max ON products(fourchette_max);

-- Step 6: Update comments
COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product (NUMERIC type - supports decimal values like 14.67)';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product (NUMERIC type - supports decimal values like 14.67)';

-- Step 7: Verify the column types
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name IN ('fourchette_min', 'fourchette_max');

COMMIT;
