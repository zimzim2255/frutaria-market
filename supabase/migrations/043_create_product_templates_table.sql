-- ============================================
-- PRODUCT TEMPLATES TABLE (Modèles de Produits)
-- ============================================
-- This table stores product templates/suggestions that can be used
-- when adding products in the Products page. It contains basic product
-- information: name, category, and photo.

CREATE TABLE IF NOT EXISTS product_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  photo_url TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_product_templates_category ON product_templates(category);
CREATE INDEX IF NOT EXISTS idx_product_templates_name ON product_templates(name);
CREATE INDEX IF NOT EXISTS idx_product_templates_created_by ON product_templates(created_by);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE product_templates ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - PRODUCT TEMPLATES
-- ============================================
CREATE POLICY "Product templates are viewable by authenticated users" ON product_templates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Product templates can be created by authenticated users" ON product_templates
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Product templates can be updated by creator or admin" ON product_templates
  FOR UPDATE USING (auth.role() = 'authenticated' AND (created_by = auth.uid() OR auth.role() = 'admin'));

CREATE POLICY "Product templates can be deleted by creator or admin" ON product_templates
  FOR DELETE USING (auth.role() = 'authenticated' AND (created_by = auth.uid() OR auth.role() = 'admin'));

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE product_templates IS 'Product templates/suggestions for quick product creation';
COMMENT ON COLUMN product_templates.name IS 'Product template name';
COMMENT ON COLUMN product_templates.category IS 'Product category';
COMMENT ON COLUMN product_templates.photo_url IS 'URL to product photo/image';
COMMENT ON COLUMN product_templates.description IS 'Optional description of the product template';
