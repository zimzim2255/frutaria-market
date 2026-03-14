-- ============================================
-- ADD FOURCHETTE MIN/MAX FIELDS TO PRODUCTS TABLE
-- ============================================
-- This migration adds two new optional fields to the products table:
-- - fourchette_min: Minimum control range value
-- - fourchette_max: Maximum control range value

ALTER TABLE products
ADD COLUMN IF NOT EXISTS fourchette_min INTEGER,
ADD COLUMN IF NOT EXISTS fourchette_max INTEGER;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_products_fourchette_min ON products(fourchette_min);
CREATE INDEX IF NOT EXISTS idx_products_fourchette_max ON products(fourchette_max);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN products.fourchette_min IS 'Minimum control range value for the product';
COMMENT ON COLUMN products.fourchette_max IS 'Maximum control range value for the product';
