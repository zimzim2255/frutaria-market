-- ============================================
-- DIAGNOSE MAG 811 SALES DISPLAY ISSUE
-- ============================================
-- This script identifies why sales for mag 811 show for manager but not admin

-- ============================================
-- STEP 1: FIND MAG 811 STORE
-- ============================================
SELECT 
  'MAG 811 STORE INFO' as check_type,
  id as store_id,
  name as store_name,
  email as store_email,
  user_id,
  created_at
FROM stores 
WHERE name ILIKE '%811%' OR email ILIKE '%811%';

-- ============================================
-- STEP 2: CHECK ALL SALES FOR MAG 811
-- ============================================
SELECT 
  'SALES FOR MAG 811' as check_type,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  st.name as store_name,
  s.total_amount,
  s.payment_status,
  s.delivery_status,
  s.created_at,
  s.created_by,
  u.email as creator_email
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
LEFT JOIN users u ON s.created_by = u.id
WHERE st.name ILIKE '%811%' OR s.store_id IN (
  SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
)
ORDER BY s.created_at DESC
LIMIT 50;

-- ============================================
-- STEP 3: SALES BY DATE FOR MAG 811
-- ============================================
SELECT 
  'MAG 811 SALES BY DATE' as check_type,
  DATE(s.created_at) as sale_date,
  COUNT(*) as sale_count,
  SUM(s.total_amount) as total_amount
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE st.name ILIKE '%811%' OR s.store_id IN (
  SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
)
GROUP BY DATE(s.created_at)
ORDER BY sale_date DESC;

-- ============================================
-- STEP 4: CHECK IF MAG 811 SALES HAVE STORE_ID
-- ============================================
SELECT 
  'MAG 811 SALES STORE_ID CHECK' as check_type,
  COUNT(*) as total_sales,
  COUNT(CASE WHEN store_id IS NOT NULL THEN 1 END) as sales_with_store_id,
  COUNT(CASE WHEN store_id IS NULL THEN 1 END) as sales_without_store_id
FROM sales s
WHERE s.created_by IN (
  SELECT id FROM users WHERE email ILIKE '%811%' OR store_id IN (
    SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
  )
);

-- ============================================
-- STEP 5: CHECK RLS POLICIES ON SALES TABLE
-- ============================================
SELECT 
  'RLS POLICIES ON SALES' as check_type,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'sales';

-- ============================================
-- STEP 6: CHECK IF RLS IS ENABLED ON SALES
-- ============================================
SELECT 
  'RLS STATUS ON SALES' as check_type,
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'sales';

-- ============================================
-- STEP 7: CHECK ADMIN USER STORE ASSIGNMENT
-- ============================================
SELECT 
  'ADMIN USER STORE ASSIGNMENT' as check_type,
  u.id as user_id,
  u.email,
  u.role,
  u.store_id,
  s.name as admin_store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin';

-- ============================================
-- STEP 8: CHECK IF ADMIN CAN SEE MAG 811 STORE
-- ============================================
SELECT 
  'CAN ADMIN SEE MAG 811?' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM users u 
      WHERE u.role = 'admin' 
      AND (u.store_id IS NULL OR u.store_id IN (
        SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
      ))
    ) THEN 'YES - Admin can see mag 811'
    ELSE 'NO - Admin cannot see mag 811 (store_id mismatch)'
  END as admin_visibility;

-- ============================================
-- STEP 9: CHECK MAG 811 STORE_ID VALUE
-- ============================================
SELECT 
  'MAG 811 STORE_ID' as check_type,
  id as store_id,
  name,
  email
FROM stores 
WHERE name ILIKE '%811%' OR email ILIKE '%811%';

-- ============================================
-- STEP 10: CHECK SALES WITH MAG 811 STORE_ID
-- ============================================
SELECT 
  'SALES WITH MAG 811 STORE_ID' as check_type,
  COUNT(*) as total_sales,
  MIN(created_at) as earliest_sale,
  MAX(created_at) as latest_sale
FROM sales
WHERE store_id IN (
  SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
);

-- ============================================
-- STEP 11: CHECK FOR DATA INCONSISTENCIES
-- ============================================
SELECT 
  'DATA INCONSISTENCIES' as check_type,
  'Sales without store_id' as issue,
  COUNT(*) as count,
  NULL::text as additional_info
FROM sales WHERE store_id IS NULL
UNION ALL
SELECT 
  'DATA INCONSISTENCIES' as check_type,
  'Sales with invalid store_id' as issue,
  COUNT(*) as count,
  NULL::text as additional_info
FROM sales WHERE store_id IS NOT NULL AND store_id NOT IN (SELECT id FROM stores)
UNION ALL
SELECT 
  'DATA INCONSISTENCIES' as check_type,
  'Mag 811 sales without proper store_id' as issue,
  COUNT(*) as count,
  NULL::text as additional_info
FROM sales s
WHERE s.created_by IN (
  SELECT id FROM users WHERE email ILIKE '%811%' OR store_id IN (
    SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
  )
)
AND s.store_id IS NULL;

-- ============================================
-- STEP 12: RECOMMENDATIONS
-- ============================================
SELECT 
  'RECOMMENDATIONS' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM sales s
      WHERE s.created_by IN (
        SELECT id FROM users WHERE email ILIKE '%811%' OR store_id IN (
          SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
        )
      )
      AND s.store_id IS NULL
    ) THEN 'FIX: Update sales without store_id to use mag 811 store_id'
    WHEN EXISTS (
      SELECT 1 FROM users u 
      WHERE u.role = 'admin' 
      AND u.store_id IS NOT NULL
      AND u.store_id NOT IN (
        SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
      )
    ) THEN 'FIX: Admin has store_id assigned - may need to set to NULL or add mag 811 store'
    ELSE 'Check RLS policies and admin store assignment'
  END as recommendation;
