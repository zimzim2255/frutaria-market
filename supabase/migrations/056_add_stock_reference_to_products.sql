-- Add stock_reference to products and index it
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_reference VARCHAR(20);
CREATE INDEX IF NOT EXISTS idx_products_stock_reference ON products(stock_reference);

-- NOTE:
-- We intentionally do NOT add a UNIQUE constraint on products.stock_reference.
-- One stock reference represents a "lot" and can be shared by multiple product rows.
-- Uniqueness (when needed) is managed via stock_reference_details.stock_reference.
