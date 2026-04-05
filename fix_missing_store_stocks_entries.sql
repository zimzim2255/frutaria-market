-- ============================================================
-- FIX: Create missing store_stocks entries for products
-- ============================================================
-- This script finds products that have quantity_available > 0
-- but NO store_stocks entry at all, and creates the missing entries.
-- ============================================================

-- STEP 1: DIAGNOSE - Find products with missing store_stocks entries
SELECT 
  p.id,
  p.reference,
  p.name,
  p.quantity_available,
  p.store_id,
  p.created_by,
  'MISSING STORE_STOCKS ENTRY' as issue_type
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
GROUP BY p.id, p.reference, p.name, p.quantity_available, p.store_id, p.created_by
HAVING COUNT(ss.id) = 0
ORDER BY p.created_at DESC;

-- STEP 2: COUNT how many products are affected
SELECT 
  COUNT(*) as products_missing_store_stocks
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
HAVING COUNT(ss.id) = 0;

-- STEP 3: FIX - Create missing store_stocks entries
-- For each product with quantity_available > 0 but no store_stocks entry,
-- create a new store_stocks entry with the same quantity and store_id
INSERT INTO store_stocks (product_id, store_id, quantity, created_at)
SELECT 
  p.id as product_id,
  p.store_id as store_id,
  p.quantity_available as quantity,
  NOW() as created_at
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
  AND p.store_id IS NOT NULL
GROUP BY p.id, p.store_id, p.quantity_available
HAVING COUNT(ss.id) = 0
ON CONFLICT (product_id, store_id) 
DO UPDATE SET 
  quantity = EXCLUDED.quantity,
  updated_at = NOW();

-- STEP 4: VERIFY - Check that all entries were created
SELECT 
  COUNT(*) as remaining_missing_entries
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
HAVING COUNT(ss.id) = 0;

-- STEP 5: SHOW what was fixed
SELECT 
  p.reference,
  p.name,
  p.quantity_available as product_qty,
  ss.quantity as store_stock_qty,
  p.store_id,
  'FIXED - Created store_stocks entry' as status
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available = ss.quantity
  AND p.quantity_available > 0
  AND ss.updated_at >= NOW() - INTERVAL '1 minute'
ORDER BY p.created_at DESC
LIMIT 20;