-- ============================================
-- ADD FOURCHETTE FIELDS TO PRODUCT TEMPLATES TABLE
-- ============================================
-- This migration adds two new optional fields to the product_templates table:
-- - fourchette_min: Minimum control range value
-- - fourchette_max: Maximum control range value
-- These fields allow product templates to store price range information
-- that can be imported when creating products

ALTER TABLE product_templates
ADD COLUMN IF NOT EXISTS fourchette_min NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS fourchette_max NUMERIC(10, 2);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_templates_fourchette_min ON product_templates(fourchette_min);
CREATE INDEX IF NOT EXISTS idx_product_templates_fourchette_max ON product_templates(fourchette_max);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN product_templates.fourchette_min IS 'Minimum control range value for the product template (supports decimal values like 14.67)';
COMMENT ON COLUMN product_templates.fourchette_max IS 'Maximum control range value for the product template (supports decimal values like 14.67)';
