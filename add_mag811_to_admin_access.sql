-- ============================================
-- ADD MAG 811 TO ADMIN'S ALLOWED STORES
-- ============================================
-- This script allows the admin to see mag 811's sales data
-- by setting the admin's store_id to NULL (access to all stores)

-- Step 1: Check current admin user and their store_id
SELECT 
  'Current Admin User' as info,
  id,
  email,
  name,
  role,
  store_id,
  is_active
FROM users 
WHERE role = 'admin';

-- Step 2: Check mag 811's store information
SELECT 
  'Mag 811 Store Info' as info,
  id,
  name,
  email,
  user_id,
  status
FROM stores 
WHERE name ILIKE '%811%' OR email ILIKE '%811%';

-- Step 3: Check current sales for mag 811
SELECT 
  'Mag 811 Sales Count' as info,
  COUNT(*) as total_sales,
  MIN(sale_date) as earliest_sale,
  MAX(sale_date) as latest_sale
FROM sales s
JOIN stores st ON s.store_id = st.id
WHERE st.name ILIKE '%811%' OR st.email ILIKE '%811%';

-- Step 4: Update admin user to have store_id = NULL
-- This allows the admin to see ALL stores' data
UPDATE users 
SET store_id = NULL
WHERE role = 'admin' 
  AND store_id IS NOT NULL;

-- Step 5: Verify the update
SELECT 
  'Updated Admin User' as info,
  id,
  email,
  name,
  role,
  store_id,
  is_active
FROM users 
WHERE role = 'admin';

-- Step 6: Verify admin can now see mag 811's sales
SELECT 
  'Mag 811 Sales After Fix' as info,
  COUNT(*) as total_sales,
  MIN(sale_date) as earliest_sale,
  MAX(sale_date) as latest_sale
FROM sales s
JOIN stores st ON s.store_id = st.id
WHERE st.name ILIKE '%811%' OR st.email ILIKE '%811%';

-- Step 7: Check all stores the admin can now access
SELECT 
  'All Stores Accessible to Admin' as info,
  st.id as store_id,
  st.name as store_name,
  st.email as store_email,
  COUNT(s.id) as sales_count
FROM stores st
LEFT JOIN sales s ON st.id = s.store_id
GROUP BY st.id, st.name, st.email
ORDER BY st.name;

-- Step 8: Verify RLS policies are working correctly
-- This query should now return mag 811's sales when run as admin
SELECT 
  'Sales Visible to Admin (All Stores)' as info,
  st.name as store_name,
  COUNT(s.id) as sales_count,
  MIN(s.sale_date) as earliest_sale,
  MAX(s.sale_date) as latest_sale
FROM sales s
JOIN stores st ON s.store_id = st.id
GROUP BY st.name
ORDER BY st.name;
