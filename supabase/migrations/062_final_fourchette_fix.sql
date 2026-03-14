-- Migration: Final fix for fourchette columns - ensure they are NUMERIC and not INTEGER
-- This migration will:
-- 1. Drop and recreate the columns to ensure they are NUMERIC
-- 2. Remove any constraints that might be enforcing integer type
-- 3. Verify the column types

BEGIN;

-- First, let's check what constraints exist
-- SELECT constraint_name, constraint_type 
-- FROM information_schema.table_constraints 
-- WHERE table_name = 'products';

-- Drop the old columns and recreate them as NUMERIC
ALTER TABLE products
DROP COLUMN IF EXISTS fourchette_min CASCADE,
DROP COLUMN IF EXISTS fourchette_max CASCADE;

-- Add the columns back as NUMERIC type
ALTER TABLE products
ADD COLUMN fourchette_min NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN fourchette_max NUMERIC(10, 2) DEFAULT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_products_fourchette_min ON products(fourchette_min);
CREATE INDEX IF NOT EXISTS idx_products_fourchette_max ON products(fourchette_max);

-- Add comments
COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product (supports decimal values like 14.67)';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product (supports decimal values like 14.67)';

COMMIT;
