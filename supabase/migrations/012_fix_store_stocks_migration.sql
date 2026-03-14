-- Migration: Fix store_stocks - properly populate store_id
-- This script fixes the NULL store_id issue

-- Step 1: First, let's see what users and stores we have
SELECT 
  u.id as user_id,
  u.email,
  u.store_id,
  s.id as store_actual_id,
  s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
ORDER BY u.created_at DESC;

-- Step 2: Check products and their creators
SELECT 
  p.id,
  p.name,
  p.reference,
  p.quantity_available,
  p.created_by,
  u.email as creator_email,
  u.store_id
FROM products p
LEFT JOIN users u ON p.created_by = u.id
WHERE p.quantity_available > 0
ORDER BY p.created_at DESC;

-- Step 3: Delete existing store_stocks entries with NULL store_id
DELETE FROM store_stocks WHERE store_id IS NULL;

-- Step 4: Re-insert with proper store_id
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

-- Step 5: Verify the fix
SELECT 
  COUNT(*) as total_store_stocks,
  COUNT(DISTINCT product_id) as products_with_stocks,
  COUNT(DISTINCT store_id) as stores_with_stocks,
  SUM(quantity) as total_quantity
FROM store_stocks
WHERE store_id IS NOT NULL;

-- Step 6: Show the populated store_stocks
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
ORDER BY p.name, s.name;
