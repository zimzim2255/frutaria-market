-- Check RLS policies on sales table
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
WHERE tablename = 'sales'
ORDER BY policyname;

-- Check if RLS is enabled
SELECT 
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'sales';

-- Check the current user and their role
SELECT 
    auth.uid() as current_user_id,
    auth.role() as current_role;

-- Check what store_id the admin user is associated with
SELECT 
    id,
    email,
    role,
    store_id
FROM users 
WHERE id = auth.uid();
