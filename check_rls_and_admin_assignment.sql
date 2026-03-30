-- ============================================
-- CHECK RLS POLICIES AND ADMIN STORE ASSIGNMENT
-- ============================================
-- This script specifically checks RLS policies and admin store assignment
-- to identify why sales might not display in admin interface

-- ============================================
-- STEP 1: CHECK ALL RLS POLICIES ON SALES TABLE
-- ============================================
SELECT 
  '=== RLS POLICIES ON SALES TABLE ===' as section,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'sales'
ORDER BY policyname;

-- ============================================
-- STEP 2: CHECK IF RLS IS ENABLED ON SALES TABLE
-- ============================================
SELECT 
  '=== RLS STATUS ON SALES TABLE ===' as section,
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'sales';

-- ============================================
-- STEP 3: CHECK ALL ADMIN USERS AND THEIR STORE ASSIGNMENT
-- ============================================
SELECT 
  '=== ALL ADMIN USERS ===' as section,
  u.id,
  u.email,
  u.name,
  u.role,
  u.store_id,
  s.name as store_name,
  s.email as store_email,
  CASE 
    WHEN u.store_id IS NULL THEN 'Admin sees ALL stores'
    ELSE 'Admin sees only store: ' || s.name
  END as visibility_scope
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin'
ORDER BY u.email;

-- ============================================
-- STEP 4: CHECK MG811 USER AND STORE
-- ============================================
SELECT 
  '=== MG811 USER DETAILS ===' as section,
  u.id,
  u.email,
  u.name,
  u.role,
  u.store_id,
  s.name as store_name,
  s.email as store_email
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email LIKE '%mg811%';

-- ============================================
-- STEP 5: COUNT SALES BY STORE FOR MG811
-- ============================================
SELECT 
  '=== MG811 STORE SALES COUNT ===' as section,
  s.store_id,
  st.name as store_name,
  COUNT(*) as sale_count,
  SUM(s.total_amount) as total_amount
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE s.store_id = (SELECT store_id FROM users WHERE email LIKE '%mg811%' LIMIT 1)
GROUP BY s.store_id, st.name;

-- ============================================
-- STEP 6: CHECK IF ADMIN CAN SEE MG811 STORE SALES
-- ============================================
-- This simulates what admin would see based on their store_id
SELECT 
  '=== ADMIN VISIBILITY SIMULATION ===' as section,
  admin_u.email as admin_email,
  admin_u.store_id as admin_store_id,
  admin_st.name as admin_store_name,
  mg811_st.id as mg811_store_id,
  mg811_st.name as mg811_store_name,
  COUNT(s.id) as sales_count,
  CASE 
    WHEN admin_u.store_id IS NULL THEN 'Admin should see ALL sales'
    WHEN admin_u.store_id = mg811_st.id THEN 'Admin should see mg811 store sales'
    ELSE 'Admin should NOT see mg811 store sales'
  END as expected_visibility
FROM users admin_u
LEFT JOIN stores admin_st ON admin_u.store_id = admin_st.id
CROSS JOIN stores mg811_st
LEFT JOIN sales s ON s.store_id = mg811_st.id
WHERE admin_u.role = 'admin'
  AND mg811_st.id = (SELECT store_id FROM users WHERE email LIKE '%mg811%' LIMIT 1)
GROUP BY admin_u.email, admin_u.store_id, admin_st.name, mg811_st.id, mg811_st.name;

-- ============================================
-- STEP 7: CHECK SALES WITH INVALID STORE_ID
-- ============================================
SELECT 
  '=== SALES WITH INVALID STORE_ID ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  s.total_amount,
  s.sale_date,
  s.created_by,
  u.email as creator_email
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
WHERE s.store_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM stores WHERE id = s.store_id)
ORDER BY s.created_at DESC
LIMIT 20;

-- ============================================
-- STEP 8: CHECK SALES CREATED BY MG811
-- ============================================
SELECT 
  '=== SALES CREATED BY MG811 ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  st.name as store_name,
  s.total_amount,
  s.payment_status,
  s.sale_date,
  s.created_by,
  u.email as creator_email
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st ON s.store_id = st.id
WHERE u.email LIKE '%mg811%'
ORDER BY s.created_at DESC
LIMIT 20;

-- ============================================
-- STEP 9: CHECK FOR STORE_ID MISMATCHES
-- ============================================
SELECT 
  '=== STORE_ID MISMATCHES ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id as sale_store_id,
  st_sale.name as sale_store_name,
  u.store_id as user_store_id,
  st_user.name as user_store_name,
  u.email as creator_email
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st_sale ON s.store_id = st_sale.id
LEFT JOIN stores st_user ON u.store_id = st_user.id
WHERE s.store_id IS NOT NULL
  AND u.store_id IS NOT NULL
  AND s.store_id != u.store_id
  AND u.email LIKE '%mg811%'
ORDER BY s.created_at DESC
LIMIT 20;

-- ============================================
-- STEP 10: RECOMMENDATIONS
-- ============================================
SELECT 
  '=== RECOMMENDATIONS ===' as section,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM users 
      WHERE role = 'admin' AND store_id IS NOT NULL
    ) THEN 'Admin has store_id assigned. Admin can only see sales from their store. Consider setting admin store_id to NULL to see all stores.'
    WHEN EXISTS (
      SELECT 1 FROM sales s
      LEFT JOIN users u ON s.created_by = u.id
      WHERE u.email LIKE '%mg811%' AND s.store_id != u.store_id
    ) THEN 'Found store_id mismatches. Sales created by mg811 have different store_id than user. Update sales store_id to match user store_id.'
    ELSE 'No obvious issues found. Check RLS policies in Supabase dashboard.'
  END as recommendation;
