-- Add max_purchase_limit column to products table
-- This field controls the maximum quantity that can be purchased in a single transaction
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_purchase_limit INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.max_purchase_limit IS 'Maximum quantity allowed per purchase. If NULL, no limit is enforced.';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_products_max_purchase_limit ON products(max_purchase_limit);
