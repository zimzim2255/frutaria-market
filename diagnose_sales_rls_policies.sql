-- Diagnostic script to investigate RLS policies and sales filtering for day 27
-- Run this in Supabase SQL Editor

-- 1. Check all RLS policies on the sales table
SELECT 
    '=== RLS POLICIES ON SALES TABLE ===' as diagnostic_step,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'sales'
ORDER BY policyname;

-- 2. Check if RLS is enabled on sales table
SELECT 
    '=== RLS STATUS ON SALES TABLE ===' as diagnostic_step,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'sales';

-- 3. Check what sales exist for day 27 (March 27, 2026)
SELECT 
    '=== SALES ON DAY 27 (2026-03-27) ===' as diagnostic_step,
    id,
    sale_number,
    store_id,
    created_at,
    total_amount,
    payment_status,
    delivery_status
FROM sales 
WHERE DATE(created_at) = '2026-03-27'
ORDER BY created_at DESC;

-- 4. Check what sales exist for day 28 (for comparison)
SELECT 
    '=== SALES ON DAY 28 (2026-03-28) ===' as diagnostic_step,
    id,
    sale_number,
    store_id,
    created_at,
    total_amount,
    payment_status,
    delivery_status
FROM sales 
WHERE DATE(created_at) = '2026-03-28'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Check what store_id the admin user is associated with
SELECT 
    '=== ADMIN USER STORE ASSOCIATION ===' as diagnostic_step,
    u.id as user_id,
    u.email,
    u.role,
    u.store_id as user_store_id,
    s.name as store_name
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.role = 'admin'
ORDER BY u.created_at DESC;

-- 6. Check what stores exist
SELECT 
    '=== ALL STORES ===' as diagnostic_step,
    id,
    name,
    created_at
FROM stores
ORDER BY name;

-- 7. Check sales by store for day 27
SELECT 
    '=== SALES BY STORE ON DAY 27 ===' as diagnostic_step,
    s.store_id,
    st.name as store_name,
    COUNT(*) as sale_count,
    SUM(s.total_amount) as total_amount
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE DATE(s.created_at) = '2026-03-27'
GROUP BY s.store_id, st.name
ORDER BY sale_count DESC;

-- 8. Check sales by store for day 28 (for comparison)
SELECT 
    '=== SALES BY STORE ON DAY 28 ===' as diagnostic_step,
    s.store_id,
    st.name as store_name,
    COUNT(*) as sale_count,
    SUM(s.total_amount) as total_amount
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
WHERE DATE(s.created_at) = '2026-03-28'
GROUP BY s.store_id, st.name
ORDER BY sale_count DESC;

-- 9. Check if there are any triggers on sales table
SELECT 
    '=== TRIGGERS ON SALES TABLE ===' as diagnostic_step,
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'sales'
ORDER BY trigger_name;

-- 10. Check the structure of the sales table
SELECT 
    '=== SALES TABLE STRUCTURE ===' as diagnostic_step,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sales'
ORDER BY ordinal_position;
