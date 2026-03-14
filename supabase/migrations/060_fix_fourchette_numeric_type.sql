-- Migration: Fix fourchette columns to support decimal values
-- This migration changes fourchette_min and fourchette_max from INTEGER to NUMERIC
-- to allow decimal values like 14.67

BEGIN;

-- Drop the existing indexes first
DROP INDEX IF EXISTS idx_products_fourchette_min;
DROP INDEX IF EXISTS idx_products_fourchette_max;

-- Alter the columns to NUMERIC type
ALTER TABLE products
ALTER COLUMN fourchette_min TYPE NUMERIC(10, 2) USING fourchette_min::NUMERIC(10, 2),
ALTER COLUMN fourchette_max TYPE NUMERIC(10, 2) USING fourchette_max::NUMERIC(10, 2);

-- Recreate the indexes
CREATE INDEX idx_products_fourchette_min ON products(fourchette_min);
CREATE INDEX idx_products_fourchette_max ON products(fourchette_max);

-- Update comments
COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product (supports decimal values like 14.67)';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product (supports decimal values like 14.67)';

COMMIT;
