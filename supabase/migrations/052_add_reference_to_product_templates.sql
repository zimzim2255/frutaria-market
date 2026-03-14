-- ============================================
-- ADD REFERENCE FIELD TO PRODUCT TEMPLATES TABLE
-- ============================================
-- This migration adds the reference field to the product_templates table
-- - reference: Product reference/identifier

ALTER TABLE product_templates
ADD COLUMN IF NOT EXISTS reference VARCHAR(255);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_templates_reference ON product_templates(reference);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN product_templates.reference IS 'Product reference/identifier';
