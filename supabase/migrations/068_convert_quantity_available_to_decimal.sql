-- Migration: Convert quantity_available from INTEGER to DECIMAL
-- Purpose: Allow storing decimal values like 16.50 instead of rounding to integers

BEGIN;

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS stock_summary CASCADE;

-- Step 2: Convert quantity_available from INTEGER to DECIMAL(15, 2)
ALTER TABLE products
ALTER COLUMN quantity_available TYPE DECIMAL(15, 2) USING quantity_available::DECIMAL(15, 2);

-- Step 3: Update comments
COMMENT ON COLUMN products.quantity_available IS 'Quantity available in stock (supports decimal values like 16.50)';

-- Step 4: Recreate the stock_summary view
CREATE OR REPLACE VIEW stock_summary AS
SELECT 
  p.id,
  p.name,
  p.reference,
  p.category,
  p.quantity_available,
  p.sale_price,
  p.avg_net_weight_per_box,
  sup.name as supplier_name
FROM products p
LEFT JOIN suppliers sup ON p.supplier_id = sup.id
ORDER BY p.name;

-- Step 5: Verify the change
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
AND column_name = 'quantity_available';

COMMIT;
