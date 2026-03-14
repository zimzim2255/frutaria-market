-- Add product_category column to products table for additional categorization
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_category VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN products.product_category IS 'Additional product category for classification';
