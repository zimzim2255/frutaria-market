-- ============================================
-- DIAGNOSE SALES DISPLAY ISSUE
-- ============================================
-- This script helps identify why some sales display in a magasin
-- but not in the admin interface

-- ============================================
-- STEP 1: CHECK ALL SALES BY STORE
-- ============================================
SELECT 
  '=== SALES BY STORE ===' as section,
  s.store_id,
  st.name as store_name,
  st.email as store_email,
  COUNT(*) as sale_count,
  SUM(s.total_amount) as total_amount,
  MIN(s.sale_date) as earliest_sale,
  MAX(s.sale_date) as latest_sale
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
GROUP BY s.store_id, st.name, st.email
ORDER BY sale_count DESC;

-- ============================================
-- STEP 2: CHECK SALES WITH NULL STORE_ID
-- ============================================
SELECT 
  '=== SALES WITH NULL STORE_ID ===' as section,
  COUNT(*) as count,
  SUM(total_amount) as total_amount
FROM sales
WHERE store_id IS NULL;

-- ============================================
-- STEP 3: CHECK MG811 STORE AND SALES
-- ============================================
SELECT 
  '=== MG811 STORE INFO ===' as section,
  u.id as user_id,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name,
  s.email as store_email
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email LIKE '%mg811%';

-- ============================================
-- STEP 4: SALES CREATED BY MG811
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
LIMIT 50;

-- ============================================
-- STEP 5: CHECK FOR STORE_ID MISMATCHES
-- ============================================
-- Sales where created_by user has a different store_id than the sale
SELECT 
  '=== STORE_ID MISMATCHES ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id as sale_store_id,
  st_sale.name as sale_store_name,
  u.store_id as user_store_id,
  st_user.name as user_store_name,
  u.email as creator_email,
  s.total_amount,
  s.sale_date
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st_sale ON s.store_id = st_sale.id
LEFT JOIN stores st_user ON u.store_id = st_user.id
WHERE s.store_id IS NOT NULL 
  AND u.store_id IS NOT NULL
  AND s.store_id != u.store_id
ORDER BY s.created_at DESC
LIMIT 50;

-- ============================================
-- STEP 6: CHECK RLS POLICIES ON SALES TABLE
-- ============================================
SELECT 
  '=== RLS POLICIES ON SALES ===' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'sales';

-- ============================================
-- STEP 7: CHECK ADMIN USER STORE ASSIGNMENT
-- ============================================
SELECT 
  '=== ADMIN USERS ===' as section,
  u.id,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin';

-- ============================================
-- STEP 8: SALES THAT MIGHT BE HIDDEN FROM ADMIN
-- ============================================
-- Sales that exist but might not show due to store_id filtering
SELECT 
  '=== POTENTIAL HIDDEN SALES ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  st.name as store_name,
  s.total_amount,
  s.payment_status,
  s.sale_date,
  s.created_by,
  u.email as creator_email,
  u.role as creator_role,
  CASE 
    WHEN s.store_id IS NULL THEN 'No store assigned'
    WHEN NOT EXISTS (SELECT 1 FROM stores WHERE id = s.store_id) THEN 'Store does not exist'
    ELSE 'Store exists'
  END as store_status
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st ON s.store_id = st.id
WHERE s.store_id IS NULL 
   OR NOT EXISTS (SELECT 1 FROM stores WHERE id = s.store_id)
ORDER BY s.created_at DESC
LIMIT 50;

-- ============================================
-- STEP 9: COMPARE SALES COUNT BY VISIBILITY
-- ============================================
SELECT 
  '=== SALES VISIBILITY SUMMARY ===' as section,
  COUNT(*) as total_sales,
  COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as sales_with_store,
  COUNT(CASE WHEN store_id IS NULL THEN 1 END) as sales_without_store,
  COUNT(CASE WHEN EXISTS (SELECT 1 FROM stores WHERE id = sales.store_id) THEN 1 END) as sales_with_valid_store,
  COUNT(CASE WHEN NOT EXISTS (SELECT 1 FROM stores WHERE id = sales.store_id) THEN 1 END) as sales_with_invalid_store
FROM sales;

-- ============================================
-- STEP 10: CHECK SPECIFIC MG811 STORE SALES
-- ============================================
SELECT 
  '=== MG811 STORE SALES DETAILS ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  st.name as store_name,
  s.total_amount,
  s.payment_status,
  s.sale_date,
  s.notes,
  s.created_by,
  u.email as creator_email
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st ON s.store_id = st.id
WHERE s.store_id = (SELECT store_id FROM users WHERE email LIKE '%mg811%' LIMIT 1)
ORDER BY s.created_at DESC
LIMIT 50;

-- ============================================
-- STEP 11: CHECK IF ADMIN CAN SEE MG811 STORE
-- ============================================
SELECT 
  '=== ADMIN VISIBILITY CHECK ===' as section,
  admin_u.email as admin_email,
  admin_u.store_id as admin_store_id,
  admin_st.name as admin_store_name,
  mg811_u.email as mg811_email,
  mg811_u.store_id as mg811_store_id,
  mg811_st.name as mg811_store_name,
  CASE 
    WHEN admin_u.store_id IS NULL THEN 'Admin sees all stores'
    WHEN admin_u.store_id = mg811_u.store_id THEN 'Admin sees mg811 store'
    ELSE 'Admin does NOT see mg811 store'
  END as visibility_status
FROM users admin_u
LEFT JOIN stores admin_st ON admin_u.store_id = admin_st.id
CROSS JOIN users mg811_u
LEFT JOIN stores mg811_st ON mg811_u.store_id = mg811_st.id
WHERE admin_u.role = 'admin' 
  AND mg811_u.email LIKE '%mg811%';

-- ============================================
-- STEP 12: RECOMMENDATIONS
-- ============================================
SELECT 
  '=== RECOMMENDATIONS ===' as section,
  CASE 
    WHEN EXISTS (SELECT 1 FROM sales WHERE store_id IS NULL) 
    THEN 'Found sales with NULL store_id. Run: UPDATE sales SET store_id = (SELECT store_id FROM users WHERE email LIKE ''%mg811%'' LIMIT 1) WHERE store_id IS NULL;'
    WHEN EXISTS (
      SELECT 1 FROM sales s 
      LEFT JOIN users u ON s.created_by = u.id 
      WHERE u.email LIKE '%mg811%' AND s.store_id != u.store_id
    )
    THEN 'Found store_id mismatches. Sales created by mg811 have different store_id than user.'
    ELSE 'No obvious issues found. Check RLS policies and admin store assignment.'
  END as recommendation;
