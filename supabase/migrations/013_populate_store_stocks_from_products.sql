-- Migration: Create stores for users and populate store_stocks
-- This script creates a store for each user and populates store_stocks

-- Step 1: Check current state
SELECT 
  'Users without store_id' as check_type,
  COUNT(*) as count
FROM users 
WHERE store_id IS NULL;

SELECT 
  'Stores in database' as check_type,
  COUNT(*) as count
FROM stores;

SELECT 
  'Products with quantity > 0' as check_type,
  COUNT(*) as count
FROM products 
WHERE quantity_available > 0;

-- Step 2: Create a store for each user that doesn't have one
INSERT INTO stores (name, email, status)
SELECT 
  COALESCE(u.name, u.email) as name,
  u.email,
  'active' as status
FROM users u
WHERE u.store_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM stores s WHERE s.email = u.email
  )
ON CONFLICT DO NOTHING;

-- Step 3: Update users to link them to their stores
UPDATE users u
SET store_id = (
  SELECT s.id FROM stores s WHERE s.email = u.email LIMIT 1
)
WHERE u.store_id IS NULL
  AND EXISTS (
    SELECT 1 FROM stores s WHERE s.email = u.email
  );

-- Step 4: Verify users now have store_id
SELECT 
  'Users with store_id after update' as check_type,
  COUNT(*) as count
FROM users 
WHERE store_id IS NOT NULL;

-- Step 5: Now populate store_stocks from products
INSERT INTO store_stocks (product_id, store_id, quantity)
SELECT 
  p.id as product_id,
  u.store_id as store_id,
  p.quantity_available as quantity
FROM products p
LEFT JOIN users u ON p.created_by = u.id
WHERE 
  p.quantity_available > 0 
  AND p.created_by IS NOT NULL
  AND u.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM store_stocks ss 
    WHERE ss.product_id = p.id AND ss.store_id = u.store_id
  )
ON CONFLICT DO NOTHING;

-- Step 6: Verify the population
SELECT 
  'Store stocks after population' as check_type,
  COUNT(*) as total_entries,
  COUNT(DISTINCT product_id) as unique_products,
  COUNT(DISTINCT store_id) as unique_stores,
  SUM(quantity) as total_quantity
FROM store_stocks;

-- Step 7: Show the populated data
SELECT 
  ss.product_id,
  p.name,
  p.reference,
  ss.store_id,
  s.name as store_name,
  ss.quantity
FROM store_stocks ss
LEFT JOIN products p ON ss.product_id = p.id
LEFT JOIN stores s ON ss.store_id = s.id
ORDER BY p.reference, s.name;
