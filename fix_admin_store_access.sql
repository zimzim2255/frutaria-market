-- ============================================
-- FIX ADMIN STORE ACCESS FOR MAG 811
-- ============================================
-- This script fixes the issue where admin cannot see mag 811 sales
-- because they have a specific store_id assigned

-- ============================================
-- STEP 1: CHECK CURRENT ADMIN STORE ASSIGNMENT
-- ============================================
SELECT 
  'CURRENT ADMIN STORE ASSIGNMENT' as check_type,
  u.id as user_id,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin';

-- ============================================
-- STEP 2: CHECK MAG 811 STORE ID
-- ============================================
SELECT 
  'MAG 811 STORE ID' as check_type,
  id as store_id,
  name as store_name,
  email as store_email
FROM stores 
WHERE name ILIKE '%811%' OR email ILIKE '%811%';

-- ============================================
-- STEP 3: FIX - SET ADMIN STORE_ID TO NULL
-- ============================================
-- This allows admin to see ALL stores' data
UPDATE users 
SET store_id = NULL
WHERE role = 'admin' 
AND store_id IS NOT NULL;

-- ============================================
-- STEP 4: VERIFY THE FIX
-- ============================================
SELECT 
  'VERIFIED ADMIN STORE ASSIGNMENT' as check_type,
  u.id as user_id,
  u.email,
  u.role,
  u.store_id,
  CASE 
    WHEN u.store_id IS NULL THEN 'Admin can now see ALL stores'
    ELSE 'Admin still has store_id assigned'
  END as status
FROM users u
WHERE u.role = 'admin';

-- ============================================
-- STEP 5: CHECK RLS POLICIES
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
-- STEP 6: VERIFY MAG 811 SALES EXIST
-- ============================================
SELECT 
  'MAG 811 SALES COUNT' as check_type,
  COUNT(*) as total_sales,
  MIN(created_at) as earliest_sale,
  MAX(created_at) as latest_sale
FROM sales
WHERE store_id IN (
  SELECT id FROM stores WHERE name ILIKE '%811%' OR email ILIKE '%811%'
);

-- ============================================
-- STEP 7: CHECK IF RLS NEEDS UPDATE
-- ============================================
-- If RLS policies filter by store_id, we may need to update them
-- to allow admin (role='admin') to see all stores
SELECT 
  'RLS POLICY CHECK' as check_type,
  policyname,
  qual as policy_definition,
  CASE 
    WHEN qual LIKE '%admin%' THEN 'Policy already includes admin access'
    WHEN qual LIKE '%store_id%' THEN 'Policy filters by store_id - may need update'
    ELSE 'Policy needs review'
  END as recommendation
FROM pg_policies
WHERE tablename = 'sales'
AND cmd = 'SELECT';

-- ============================================
-- STEP 8: ALTERNATIVE FIX - UPDATE RLS POLICY
-- ============================================
-- If the above doesn't work, we need to update the RLS policy
-- to allow admin role to bypass store_id filtering

-- First, drop existing policy if needed
-- DROP POLICY IF EXISTS "sales_select_policy" ON sales;

-- Then create a new policy that allows admin to see all sales
-- CREATE POLICY "sales_select_policy" ON sales
-- FOR SELECT
-- USING (
--   -- Admin can see all sales
--   (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
--   OR
--   -- Non-admin can only see sales from their store
--   store_id = (SELECT store_id FROM users WHERE id = auth.uid())
--   OR
--   -- Allow if user has no store_id assigned
--   (SELECT store_id FROM users WHERE id = auth.uid()) IS NULL
-- );

-- ============================================
-- STEP 9: FINAL VERIFICATION
-- ============================================
SELECT 
  'FINAL STATUS' as check_type,
  'Admin store_id set to NULL' as action,
  'Admin should now see all sales including mag 811' as expected_result;
