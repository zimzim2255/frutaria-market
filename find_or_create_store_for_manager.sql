-- ============================================
-- FIND OR CREATE STORE FOR MANAGER
-- ============================================
-- This script helps find the correct store for manager mg811@gmail.com
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: CHECK ALL STORES
-- ============================================
SELECT 
  '=== ALL STORES ===' as section,
  id,
  name,
  email,
  user_id,
  created_at
FROM stores
ORDER BY created_at DESC;

-- ============================================
-- STEP 2: CHECK STORES CREATED BY MANAGER
-- ============================================
SELECT 
  '=== STORES CREATED BY MANAGER ===' as section,
  s.id,
  s.name,
  s.email,
  s.user_id,
  s.created_at
FROM stores s
WHERE s.user_id = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY s.created_at DESC;

-- ============================================
-- STEP 3: CHECK STORE_STOCKS FOR MANAGER'S PRODUCTS
-- ============================================
SELECT 
  '=== STORE STOCKS FOR MANAGER PRODUCTS ===' as section,
  ss.store_id,
  s.name as store_name,
  COUNT(DISTINCT ss.product_id) as product_count
FROM store_stocks ss
LEFT JOIN stores s ON ss.store_id = s.id
WHERE ss.product_id IN (
  SELECT id FROM products 
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
)
GROUP BY ss.store_id, s.name
ORDER BY product_count DESC;

-- ============================================
-- STEP 4: CHECK SALES BY MANAGER
-- ============================================
SELECT 
  '=== SALES BY MANAGER ===' as section,
  s.store_id,
  st.name as store_name,
  COUNT(*) as sale_count
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE s.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY s.store_id, st.name
ORDER BY sale_count DESC;

-- ============================================
-- STEP 5: CHECK ORDERS BY MANAGER
-- ============================================
SELECT 
  '=== ORDERS BY MANAGER ===' as section,
  o.store_id,
  st.name as store_name,
  COUNT(*) as order_count
FROM orders o
LEFT JOIN stores st ON o.store_id = st.id
WHERE o.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY o.store_id, st.name
ORDER BY order_count DESC;

-- ============================================
-- STEP 6: CHECK PAYMENTS BY MANAGER
-- ============================================
SELECT 
  '=== PAYMENTS BY MANAGER ===' as section,
  p.store_id,
  s.name as store_name,
  COUNT(*) as payment_count
FROM payments p
LEFT JOIN stores s ON p.store_id = s.id
WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY p.store_id, s.name
ORDER BY payment_count DESC;

-- ============================================
-- STEP 7: CHECK EXPENSES BY MANAGER
-- ============================================
SELECT 
  '=== EXPENSES BY MANAGER ===' as section,
  e.store_id,
  s.name as store_name,
  COUNT(*) as expense_count
FROM expenses e
LEFT JOIN stores s ON e.store_id = s.id
WHERE e.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY e.store_id, s.name
ORDER BY expense_count DESC;

-- ============================================
-- STEP 8: CHECK PRODUCT ADDITIONS BY MANAGER
-- ============================================
SELECT 
  '=== PRODUCT ADDITIONS BY MANAGER ===' as section,
  pah.store_id,
  s.name as store_name,
  COUNT(*) as addition_count
FROM product_additions_history pah
LEFT JOIN stores s ON pah.store_id = s.id
WHERE pah.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY pah.store_id, s.name
ORDER BY addition_count DESC;

-- ============================================
-- STEP 9: FIND MOST LIKELY STORE
-- ============================================
SELECT 
  '=== MOST LIKELY STORE FOR MANAGER ===' as section,
  store_id,
  store_name,
  total_count,
  sources
FROM (
  -- From sales
  SELECT 
    s.store_id,
    st.name as store_name,
    COUNT(*) as total_count,
    'sales' as source
  FROM sales s
  LEFT JOIN stores st ON s.store_id = st.id
  WHERE s.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY s.store_id, st.name
  
  UNION ALL
  
  -- From orders
  SELECT 
    o.store_id,
    st.name as store_name,
    COUNT(*) as total_count,
    'orders' as source
  FROM orders o
  LEFT JOIN stores st ON o.store_id = st.id
  WHERE o.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY o.store_id, st.name
  
  UNION ALL
  
  -- From payments
  SELECT 
    p.store_id,
    s.name as store_name,
    COUNT(*) as total_count,
    'payments' as source
  FROM payments p
  LEFT JOIN stores s ON p.store_id = s.id
  WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY p.store_id, s.name
  
  UNION ALL
  
  -- From expenses
  SELECT 
    e.store_id,
    s.name as store_name,
    COUNT(*) as total_count,
    'expenses' as source
  FROM expenses e
  LEFT JOIN stores s ON e.store_id = s.id
  WHERE e.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY e.store_id, s.name
  
  UNION ALL
  
  -- From product additions
  SELECT 
    pah.store_id,
    s.name as store_name,
    COUNT(*) as total_count,
    'product_additions' as source
  FROM product_additions_history pah
  LEFT JOIN stores s ON pah.store_id = s.id
  WHERE pah.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY pah.store_id, s.name
) AS all_stores
WHERE store_id IS NOT NULL
ORDER BY total_count DESC
LIMIT 1;

-- ============================================
-- STEP 10: CREATE NEW STORE IF NEEDED
-- ============================================
-- Uncomment this section if no store was found above
/*
DO $$
DECLARE
  manager_id UUID;
  new_store_id UUID;
BEGIN
  -- Get manager's user ID
  SELECT id INTO manager_id FROM users WHERE email = 'mg811@gmail.com';
  
  IF manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager mg811@gmail.com not found in users table';
  END IF;
  
  -- Create a new store for the manager
  INSERT INTO stores (name, email, user_id, status)
  VALUES (
    'Magasin Manager - mg811@gmail.com',
    'mg811@gmail.com',
    manager_id,
    'active'
  )
  RETURNING id INTO new_store_id;
  
  -- Update the manager's store_id
  UPDATE users 
  SET store_id = new_store_id,
      updated_at = NOW()
  WHERE id = manager_id;
  
  RAISE NOTICE 'Created new store % and assigned to manager %', new_store_id, manager_id;
END $$;
*/

-- ============================================
-- STEP 11: ASSIGN FOUND STORE TO MANAGER
-- ============================================
-- Replace 'STORE_ID_HERE' with the actual store ID from Step 9
/*
UPDATE users 
SET 
  store_id = 'STORE_ID_HERE',  -- Replace with actual store ID
  updated_at = NOW()
WHERE 
  email = 'mg811@gmail.com'
  AND (store_id IS NULL OR store_id != 'STORE_ID_HERE');
*/

-- ============================================
-- STEP 12: VERIFY ASSIGNMENT
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
