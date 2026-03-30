-- ============================================
-- CHECK STORE DATA AFTER ASSIGNMENT
-- ============================================
-- This script checks if the store has any data
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: CHECK STORE EXISTS
-- ============================================
SELECT 
  '=== STORE DETAILS ===' as section,
  id,
  name,
  email,
  user_id,
  status,
  created_at
FROM stores 
WHERE id = '975bce35-e3ad-4774-a0f4-6d709c9d979f';

-- ============================================
-- STEP 2: CHECK MANAGER USER
-- ============================================
SELECT 
  '=== MANAGER USER ===' as section,
  id,
  email,
  role,
  store_id,
  is_active,
  updated_at
FROM users 
WHERE email = 'mg811@gmail.com';

-- ============================================
-- STEP 3: CHECK STORE STOCKS
-- ============================================
SELECT 
  '=== STORE STOCKS ===' as section,
  COUNT(DISTINCT product_id) as product_count,
  SUM(quantity) as total_quantity
FROM store_stocks
WHERE store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f';

-- ============================================
-- STEP 4: CHECK PRODUCTS IN STORE
-- ============================================
SELECT 
  '=== PRODUCTS IN STORE ===' as section,
  p.id,
  p.name,
  p.reference,
  ss.quantity
FROM store_stocks ss
INNER JOIN products p ON ss.product_id = p.id
WHERE ss.store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f'
ORDER BY p.name
LIMIT 20;

-- ============================================
-- STEP 5: CHECK ALL STORES
-- ============================================
SELECT 
  '=== ALL STORES ===' as section,
  id,
  name,
  email,
  user_id
FROM stores
ORDER BY created_at DESC;

-- ============================================
-- STEP 6: CHECK ALL STORE STOCKS
-- ============================================
SELECT 
  '=== ALL STORE STOCKS ===' as section,
  store_id,
  COUNT(DISTINCT product_id) as product_count,
  SUM(quantity) as total_quantity
FROM store_stocks
GROUP BY store_id
ORDER BY product_count DESC;

-- ============================================
-- STEP 7: CHECK ALL PRODUCTS
-- ============================================
SELECT 
  '=== ALL PRODUCTS ===' as section,
  COUNT(*) as total_products
FROM products;

-- ============================================
-- STEP 8: CHECK IF STORE HAS ANY DATA
-- ============================================
SELECT 
  '=== STORE DATA CHECK ===' as section,
  CASE 
    WHEN EXISTS (SELECT 1 FROM store_stocks WHERE store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f') 
    THEN 'Store has products in stock'
    ELSE 'Store has NO products in stock - THIS IS THE PROBLEM!'
  END as stock_status,
  CASE 
    WHEN EXISTS (SELECT 1 FROM products) 
    THEN 'Products exist in database'
    ELSE 'No products in database'
  END as products_status;

-- ============================================
-- STEP 9: FIND STORES WITH DATA
-- ============================================
SELECT 
  '=== STORES WITH DATA ===' as section,
  s.id,
  s.name,
  COUNT(DISTINCT ss.product_id) as product_count,
  SUM(ss.quantity) as total_quantity
FROM stores s
LEFT JOIN store_stocks ss ON s.id = ss.store_id
GROUP BY s.id, s.name
HAVING COUNT(DISTINCT ss.product_id) > 0
ORDER BY product_count DESC;

-- ============================================
-- STEP 10: RECOMMENDATION
-- ============================================
SELECT 
  '=== RECOMMENDATION ===' as section,
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM store_stocks WHERE store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f') 
    THEN 'Store has no products. You need to add products to this store or assign an existing store with data.'
    WHEN NOT EXISTS (SELECT 1 FROM products) 
    THEN 'No products exist in database. You need to create products first.'
    ELSE 'Store has data. Try logging out and logging back in.'
  END as recommendation;
