-- Diagnostic SQL to check sales count and potential limits
-- Run this in Supabase SQL Editor to diagnose the 1000 row limit issue

-- 1. Total count of all sales in the database
SELECT COUNT(*) as total_sales_count FROM sales;

-- 2. Count sales by store (to see distribution)
SELECT 
    store_id,
    COUNT(*) as sales_count
FROM sales
GROUP BY store_id
ORDER BY sales_count DESC;

-- 3. Check if there are any RLS policies on sales table
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

-- 4. Check the most recent sales (to verify data exists beyond 1000)
SELECT 
    id,
    sale_number,
    store_id,
    created_at,
    total_amount
FROM sales
ORDER BY created_at DESC
LIMIT 10;

-- 5. Count sales created in the last 30 days
SELECT COUNT(*) as sales_last_30_days
FROM sales
WHERE created_at >= NOW() - INTERVAL '30 days';

-- 6. Count sales created in the last 7 days
SELECT COUNT(*) as sales_last_7_days
FROM sales
WHERE created_at >= NOW() - INTERVAL '7 days';

-- 7. Check for any row level security settings
SELECT 
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'sales';

-- 8. Test query with different limits to see what returns
-- This mimics what the backend does
SELECT COUNT(*) as count_with_limit_1000
FROM (
    SELECT * FROM sales
    ORDER BY created_at DESC
    LIMIT 1000
) as limited_sales;

-- 9. Check if there's a default limit in PostgREST config
-- (This would be in supabase config, not visible in SQL)

-- 10. Count by date to see if there's a pattern
SELECT 
    DATE(created_at) as sale_date,
    COUNT(*) as daily_count
FROM sales
GROUP BY DATE(created_at)
ORDER BY sale_date DESC
LIMIT 30;
