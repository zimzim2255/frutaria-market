-- Diagnostic script to investigate why day 27 sales are not showing for admin
-- Run this in Supabase SQL Editor

-- 1. Check all sales for day 27 (March 27, 2026)
SELECT 
    '=== SALES ON DAY 27 (March 27, 2026) ===' as section;

SELECT 
    id,
    sale_number,
    store_id,
    created_at,
    DATE(created_at) as sale_date,
    EXTRACT(DAY FROM created_at) as day_of_month,
    total_amount,
    payment_status,
    delivery_status
FROM sales
WHERE DATE(created_at) = '2026-03-27'
ORDER BY created_at DESC;

-- 2. Count sales by day to see the distribution
SELECT 
    '=== SALES COUNT BY DAY ===' as section;

SELECT 
    DATE(created_at) as sale_date,
    EXTRACT(DAY FROM created_at) as day_of_month,
    COUNT(*) as sale_count
FROM sales
WHERE created_at >= '2026-03-20' AND created_at < '2026-03-31'
GROUP BY DATE(created_at), EXTRACT(DAY FROM created_at)
ORDER BY sale_date;

-- 3. Check sales for the specific magasin (0442ca59-d3fc-4053-99a7-a0c057ec71d1)
SELECT 
    '=== SALES FOR MAGASIN 0442ca59-d3fc-4053-99a7-a0c057ec71d1 ===' as section;

SELECT 
    id,
    sale_number,
    store_id,
    created_at,
    DATE(created_at) as sale_date,
    EXTRACT(DAY FROM created_at) as day_of_month,
    total_amount
FROM sales
WHERE store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1'
ORDER BY created_at DESC;

-- 4. Check if there are sales on day 27 with different store_id
SELECT 
    '=== DAY 27 SALES WITH DIFFERENT STORE_ID ===' as section;

SELECT 
    s.id,
    s.sale_number,
    s.store_id,
    s.created_at,
    st.name as store_name
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE DATE(s.created_at) = '2026-03-27'
ORDER BY s.created_at DESC;

-- 5. Check if there are sales on day 27 with NULL store_id
SELECT 
    '=== DAY 27 SALES WITH NULL STORE_ID ===' as section;

SELECT 
    id,
    sale_number,
    store_id,
    created_at
FROM sales
WHERE DATE(created_at) = '2026-03-27'
    AND store_id IS NULL;

-- 6. Check the store_id data type and values for day 27 sales
SELECT 
    '=== STORE_ID VALUES FOR DAY 27 SALES ===' as section;

SELECT 
    store_id,
    pg_typeof(store_id) as store_id_type,
    COUNT(*) as count
FROM sales
WHERE DATE(created_at) = '2026-03-27'
GROUP BY store_id, pg_typeof(store_id);

-- 7. Check if the magasin exists in stores table
SELECT 
    '=== MAGASIN IN STORES TABLE ===' as section;

SELECT 
    id,
    name,
    created_at
FROM stores
WHERE id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1';

-- 8. Compare day 27 sales with other days
SELECT 
    '=== COMPARISON: DAY 27 VS OTHER DAYS ===' as section;

SELECT 
    DATE(created_at) as sale_date,
    EXTRACT(DAY FROM created_at) as day_of_month,
    COUNT(*) as total_sales,
    COUNT(CASE WHEN store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1' THEN 1 END) as sales_for_target_magasin,
    COUNT(CASE WHEN store_id IS NULL THEN 1 END) as sales_with_null_store,
    COUNT(CASE WHEN store_id != '0442ca59-d3fc-4053-99a7-a0c057ec71d1' AND store_id IS NOT NULL THEN 1 END) as sales_for_other_stores
FROM sales
WHERE created_at >= '2026-03-25' AND created_at < '2026-03-31'
GROUP BY DATE(created_at), EXTRACT(DAY FROM created_at)
ORDER BY sale_date;

-- 9. Check if there are any triggers or constraints affecting day 27
SELECT 
    '=== TRIGGERS ON SALES TABLE ===' as section;

SELECT 
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'sales';

-- 10. Check RLS policies on sales table
SELECT 
    '=== RLS POLICIES ON SALES TABLE ===' as section;

SELECT 
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
