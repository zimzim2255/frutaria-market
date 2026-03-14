-- Add lot column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS lot VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN products.lot IS 'Lot number or identifier for the product batch';
