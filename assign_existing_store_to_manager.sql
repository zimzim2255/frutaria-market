-- ============================================
-- ASSIGN EXISTING STORE TO MANAGER
-- ============================================
-- This script assigns existing store 0442ca59-d3fc-4053-99a7-a0c057ec71d1
-- to manager mg811@gmail.com
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: VERIFY STORE EXISTS
-- ============================================
SELECT 
  '=== VERIFY STORE EXISTS ===' as section,
  id,
  name,
  email,
  user_id
FROM stores 
WHERE id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1';

-- ============================================
-- STEP 2: VERIFY MANAGER USER EXISTS
-- ============================================
SELECT 
  '=== VERIFY MANAGER EXISTS ===' as section,
  id,
  email,
  role,
  store_id as current_store_id,
  is_active
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
WHERE store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1';

-- ============================================
-- STEP 4: ASSIGN STORE TO MANAGER
-- ============================================
UPDATE users 
SET 
  store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1',
  updated_at = NOW()
WHERE 
  email = 'mg811@gmail.com'
  AND (store_id IS NULL OR store_id != '0442ca59-d3fc-4053-99a7-a0c057ec71d1');

-- ============================================
-- STEP 5: VERIFY ASSIGNMENT
-- ============================================
SELECT 
  '=== VERIFICATION ===' as section,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name,
  s.email as store_email,
  u.is_active,
  u.updated_at
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email = 'mg811@gmail.com';

-- ============================================
-- STEP 6: CHECK PRODUCTS IN STORE
-- ============================================
SELECT 
  '=== PRODUCTS IN STORE ===' as section,
  p.id,
  p.name,
  p.reference,
  ss.quantity
FROM store_stocks ss
INNER JOIN products p ON ss.product_id = p.id
WHERE ss.store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1'
ORDER BY p.name
LIMIT 20;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 
  '=== SUCCESS ===' as section,
  'Store assigned to manager successfully!' as message,
  'Please log out and log back in as manager to see the data.' as next_step;
