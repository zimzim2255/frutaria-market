-- Diagnostic script to check RLS policies and sales data
-- Run this in Supabase SQL Editor

-- 1. Check if RLS is enabled on sales table
SELECT 
    '=== RLS STATUS ===' as info,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'sales';

-- 2. Show all RLS policies on sales table
SELECT 
    '=== RLS POLICIES ===' as info,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'sales'
ORDER BY policyname;

-- 3. Count total sales in database
SELECT 
    '=== TOTAL SALES COUNT ===' as info,
    COUNT(*) as total_sales
FROM sales;

-- 4. Count sales by date (showing last 10 days)
SELECT 
    '=== SALES BY DATE ===' as info,
    DATE(created_at) as sale_date,
    COUNT(*) as sales_count
FROM sales
WHERE created_at >= NOW() - INTERVAL '10 days'
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- 5. Show sales for day 27 specifically
SELECT 
    '=== SALES ON DAY 27 ===' as info,
    id,
    sale_number,
    store_id,
    created_at,
    total_amount,
    payment_status
FROM sales
WHERE EXTRACT(DAY FROM created_at) = 27
ORDER BY created_at DESC
LIMIT 20;

-- 6. Show sales for the admin's store (if we know the store_id)
-- Replace 'YOUR_STORE_ID' with the actual store_id from the console logs
SELECT 
    '=== SALES FOR ADMIN STORE ===' as info,
    id,
    sale_number,
    store_id,
    created_at,
    total_amount,
    payment_status
FROM sales
WHERE store_id = '0442ca59-d3fc-4053-99a7-a0c057ec71d1'
ORDER BY created_at DESC
LIMIT 20;

-- 7. Check if there are any sales with NULL store_id
SELECT 
    '=== SALES WITH NULL STORE_ID ===' as info,
    COUNT(*) as count
FROM sales
WHERE store_id IS NULL;

-- 8. Show distinct store_ids in sales table
SELECT 
    '=== DISTINCT STORE IDS ===' as info,
    store_id,
    COUNT(*) as sales_count
FROM sales
WHERE store_id IS NOT NULL
GROUP BY store_id
ORDER BY sales_count DESC
LIMIT 10;
