-- Migration: Migrate quantity_available from products to store_stocks
-- This script populates store_stocks table with existing product quantities

-- Step 1: For each product with quantity_available > 0, create a store_stocks entry
-- using the product's created_by user to find their store
INSERT INTO store_stocks (product_id, store_id, quantity)
SELECT 
  p.id as product_id,
  s.id as store_id,
  p.quantity_available as quantity
FROM products p
LEFT JOIN users u ON p.created_by = u.id
LEFT JOIN stores s ON u.store_id = s.id
WHERE 
  p.quantity_available > 0 
  AND p.created_by IS NOT NULL
  AND s.id IS NOT NULL
  AND NOT EXISTS (
    -- Don't insert if a store_stocks entry already exists for this product and store
    SELECT 1 FROM store_stocks ss 
    WHERE ss.product_id = p.id AND ss.store_id = s.id
  )
ON CONFLICT DO NOTHING;

-- Step 2: Verify the migration
-- This query shows how many store_stocks entries were created
SELECT 
  COUNT(*) as total_store_stocks,
  COUNT(DISTINCT product_id) as products_with_stocks,
  COUNT(DISTINCT store_id) as stores_with_stocks,
  SUM(quantity) as total_quantity
FROM store_stocks;

-- Step 3: Show products that still have quantity_available but no store_stocks
-- (These might be products without a created_by or without a store assigned to the user)
SELECT 
  p.id,
  p.name,
  p.reference,
  p.quantity_available,
  p.created_by,
  u.store_id
FROM products p
LEFT JOIN users u ON p.created_by = u.id
WHERE p.quantity_available > 0
  AND NOT EXISTS (
    SELECT 1 FROM store_stocks ss WHERE ss.product_id = p.id
  )
ORDER BY p.created_at DESC;
