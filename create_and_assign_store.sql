-- ============================================
-- CREATE STORE AND ASSIGN TO MANAGER
-- ============================================
-- This script creates store 975bce35-e3ad-4774-a0f4-6d709c9d979f
-- and assigns it to manager mg811@gmail.com
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: CHECK IF STORE EXISTS
-- ============================================
SELECT 
  '=== CHECK IF STORE EXISTS ===' as section,
  id,
  name,
  email,
  user_id
FROM stores 
WHERE id = '975bce35-e3ad-4774-a0f4-6d709c9d979f';

-- ============================================
-- STEP 2: CHECK MANAGER USER
-- ============================================
SELECT 
  '=== CHECK MANAGER USER ===' as section,
  id,
  email,
  role,
  store_id as current_store_id,
  is_active
FROM users 
WHERE email = 'mg811@gmail.com';

-- ============================================
-- STEP 3: CREATE STORE
-- ============================================
INSERT INTO stores (id, name, email, user_id, status)
VALUES (
  '975bce35-e3ad-4774-a0f4-6d709c9d979f',
  'Magasin Manager - mg811@gmail.com',
  'mg811@gmail.com',
  (SELECT id FROM users WHERE email = 'mg811@gmail.com'),
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- STEP 4: ASSIGN STORE TO MANAGER
-- ============================================
UPDATE users 
SET 
  store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f',
  updated_at = NOW()
WHERE 
  email = 'mg811@gmail.com'
  AND (store_id IS NULL OR store_id != '975bce35-e3ad-4774-a0f4-6d709c9d979f');

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
-- STEP 6: CHECK STORE STOCKS
-- ============================================
SELECT 
  '=== STORE STOCKS ===' as section,
  COUNT(DISTINCT product_id) as product_count,
  SUM(quantity) as total_quantity
FROM store_stocks
WHERE store_id = '975bce35-e3ad-4774-a0f4-6d709c9d979f';

-- ============================================
-- STEP 7: CHECK PRODUCTS IN STORE
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
-- SUCCESS MESSAGE
-- ============================================
SELECT 
  '=== SUCCESS ===' as section,
  'Store created and assigned to manager successfully!' as message,
  'Please log out and log back in as manager to see the data.' as next_step;
