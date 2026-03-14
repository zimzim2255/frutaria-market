-- ============================================
-- ADD NEW FIELDS TO PRODUCT TEMPLATES TABLE
-- ============================================
-- This migration adds four new optional fields to the product_templates table:
-- - reference_number: Product reference/SKU number
-- - entrepot: Warehouse/Storage location
-- - date_fin: End date for the product
-- - fournisseur: Supplier name

ALTER TABLE product_templates
ADD COLUMN IF NOT EXISTS reference_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS entrepot VARCHAR(255),
ADD COLUMN IF NOT EXISTS date_fin DATE,
ADD COLUMN IF NOT EXISTS fournisseur VARCHAR(255);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_templates_reference_number ON product_templates(reference_number);
CREATE INDEX IF NOT EXISTS idx_product_templates_entrepot ON product_templates(entrepot);
CREATE INDEX IF NOT EXISTS idx_product_templates_date_fin ON product_templates(date_fin);
CREATE INDEX IF NOT EXISTS idx_product_templates_fournisseur ON product_templates(fournisseur);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON COLUMN product_templates.reference_number IS 'Product reference number or SKU';
COMMENT ON COLUMN product_templates.entrepot IS 'Warehouse or storage location';
COMMENT ON COLUMN product_templates.date_fin IS 'End date for the product';
COMMENT ON COLUMN product_templates.fournisseur IS 'Supplier name';
