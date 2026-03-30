-- Simple diagnostic for day 27 sales issue
-- Run this in Supabase SQL Editor

-- 1. First, check if there are ANY sales on day 27
SELECT '=== STEP 1: Sales on day 27 ===' as step;
SELECT 
    COUNT(*) as total_day27_sales,
    MIN(created_at) as earliest_sale,
    MAX(created_at) as latest_sale
FROM sales 
WHERE DATE(created_at) = '2026-03-27';

-- 2. Show sample of day 27 sales with their store_ids
SELECT '=== STEP 2: Sample day 27 sales ===' as step;
SELECT 
    id,
    sale_number,
    store_id,
    created_at,
    total_amount
FROM sales 
WHERE DATE(created_at) = '2026-03-27'
ORDER BY created_at DESC
LIMIT 10;

-- 3. Check what store_ids exist for day 27 sales
SELECT '=== STEP 3: Store IDs for day 27 sales ===' as step;
SELECT 
    store_id,
    COUNT(*) as count
FROM sales 
WHERE DATE(created_at) = '2026-03-27'
GROUP BY store_id
ORDER BY count DESC;

-- 4. Check if the admin's selected store has ANY sales (any day)
SELECT '=== STEP 4: Sales for admin store (any day) ===' as step;
SELECT 
    DATE(created_at) as sale_date,
    COUNT(*) as count
FROM sales 
WHERE store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1'
GROUP BY DATE(created_at)
ORDER BY sale_date DESC
LIMIT 10;

-- 5. Check RLS policies on sales table
SELECT '=== STEP 5: RLS policies ===' as step;
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'sales';

-- 6. Check if RLS is enabled on sales table
SELECT '=== STEP 6: RLS enabled? ===' as step;
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'sales';
