-- ============================================
-- DIAGNOSTIC SCRIPT FOR MANAGER DATA VISIBILITY
-- ============================================
-- This script helps diagnose why manager mg811@gmail.com cannot see data
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CHECK MANAGER USER DETAILS
-- ============================================
SELECT 
  '=== MANAGER USER DETAILS ===' as section,
  u.id,
  u.email,
  u.name,
  u.role,
  u.store_id,
  u.is_active,
  u.created_at,
  au.email as auth_email,
  au.raw_user_meta_data->>'role' as auth_role,
  au.raw_user_meta_data->>'store_id' as auth_store_id
FROM users u
LEFT JOIN auth.users au ON u.id = au.id
WHERE u.email = 'mg811@gmail.com';

-- ============================================
-- 2. CHECK ALL STORES
-- ============================================
SELECT 
  '=== ALL STORES ===' as section,
  s.id,
  s.name,
  s.email,
  s.user_id,
  u.email as owner_email,
  u.role as owner_role
FROM stores s
LEFT JOIN users u ON s.user_id = u.id
ORDER BY s.created_at;

-- ============================================
-- 3. CHECK STORE_STOCKS FOR MANAGER'S STORE
-- ============================================
-- First, get the manager's store_id
WITH manager_store AS (
  SELECT store_id FROM users WHERE email = 'mg811@gmail.com'
)
SELECT 
  '=== STORE_STOCKS FOR MANAGER ===' as section,
  ss.product_id,
  ss.store_id,
  ss.quantity,
  p.name as product_name,
  p.reference as product_reference
FROM store_stocks ss
LEFT JOIN products p ON ss.product_id = p.id
WHERE ss.store_id = (SELECT store_id FROM manager_store)
LIMIT 20;

-- ============================================
-- 4. CHECK ALL PRODUCTS
-- ============================================
SELECT 
  '=== ALL PRODUCTS ===' as section,
  COUNT(*) as total_products
FROM products;

-- ============================================
-- 5. CHECK PRODUCTS CREATED BY MANAGER
-- ============================================
SELECT 
  '=== PRODUCTS CREATED BY MANAGER ===' as section,
  p.id,
  p.name,
  p.reference,
  p.created_by,
  u.email as creator_email
FROM products p
LEFT JOIN users u ON p.created_by = u.id
WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
LIMIT 20;

-- ============================================
-- 6. CHECK STORE_STOCKS DISTRIBUTION
-- ============================================
SELECT 
  '=== STORE_STOCKS DISTRIBUTION ===' as section,
  s.name as store_name,
  COUNT(DISTINCT ss.product_id) as product_count,
  SUM(ss.quantity) as total_quantity
FROM store_stocks ss
LEFT JOIN stores s ON ss.store_id = s.id
GROUP BY s.name
ORDER BY product_count DESC;

-- ============================================
-- 7. CHECK IF MANAGER HAS ANY STORE ASSIGNED
-- ============================================
SELECT 
  '=== MANAGER STORE ASSIGNMENT CHECK ===' as section,
  CASE 
    WHEN u.store_id IS NULL THEN 'NO STORE ASSIGNED - THIS IS THE PROBLEM!'
    ELSE 'Store assigned: ' || s.name
  END as status,
  u.store_id,
  s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email = 'mg811@gmail.com';

-- ============================================
-- 8. FIND STORES THAT MIGHT BELONG TO MANAGER
-- ============================================
-- Check if there's a store with the manager's email or name
SELECT 
  '=== POTENTIAL STORES FOR MANAGER ===' as section,
  s.id,
  s.name,
  s.email,
  s.user_id,
  u.email as owner_email
FROM stores s
LEFT JOIN users u ON s.user_id = u.id
WHERE s.email LIKE '%mg811%' 
   OR s.name LIKE '%mg811%'
   OR u.email = 'mg811@gmail.com';

-- ============================================
-- 9. CHECK ADMIN USER'S STORE
-- ============================================
-- See what store the admin can see
SELECT 
  '=== ADMIN USER STORE ===' as section,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin'
LIMIT 5;

-- ============================================
-- 10. SUMMARY
-- ============================================
SELECT 
  '=== SUMMARY ===' as section,
  (SELECT COUNT(*) FROM users WHERE email = 'mg811@gmail.com') as manager_exists,
  (SELECT store_id FROM users WHERE email = 'mg811@gmail.com') as manager_store_id,
  (SELECT COUNT(*) FROM stores) as total_stores,
  (SELECT COUNT(*) FROM products) as total_products,
  (SELECT COUNT(*) FROM store_stocks) as total_store_stocks;
