-- Migration: Change fourchette_min and fourchette_max from INTEGER to NUMERIC
-- Purpose: Allow decimal values (e.g., 14.67) instead of just integers
-- Date: 2024

-- ============================================
-- Change column types from INTEGER to NUMERIC
-- ============================================

ALTER TABLE products
ALTER COLUMN fourchette_min TYPE NUMERIC(10, 2),
ALTER COLUMN fourchette_max TYPE NUMERIC(10, 2);

-- ============================================
-- Update comments to reflect the change
-- ============================================

COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product (supports decimal values)';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product (supports decimal values)';
