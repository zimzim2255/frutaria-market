-- ============================================
-- FIND ALL SALES WITH STORE_ID:NULL
-- ============================================
-- This script finds all sales that were created with store_id:null
-- These are likely sales created by the manager before store assignment

-- ============================================
-- STEP 1: COUNT SALES WITH NULL STORE_ID
-- ============================================
SELECT 
  '=== COUNT SALES WITH NULL STORE_ID ===' as section,
  COUNT(*) as total_sales_with_null_store
FROM sales
WHERE store_id IS NULL;

-- ============================================
-- STEP 2: GET ALL SALES WITH NULL STORE_ID
-- ============================================
SELECT 
  '=== ALL SALES WITH NULL STORE_ID ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.total_amount,
  s.payment_status,
  s.sale_date,
  s.notes,
  s.created_by,
  u.email as creator_email,
  u.role as creator_role,
  s.created_at
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
WHERE s.store_id IS NULL
ORDER BY s.created_at DESC;

-- ============================================
-- STEP 3: CHECK IF THESE SALES BELONG TO MANAGER
-- ============================================
SELECT 
  '=== SALES WITH NULL STORE_ID BY MANAGER ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.total_amount,
  s.payment_status,
  s.sale_date,
  s.created_by,
  u.email as creator_email,
  u.role as creator_role,
  s.created_at
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
WHERE s.store_id IS NULL
  AND u.email = 'mg811@gmail.com'
ORDER BY s.created_at DESC;

-- ============================================
-- STEP 4: SUMMARY BY CREATOR
-- ============================================
SELECT 
  '=== SUMMARY BY CREATOR ===' as section,
  u.email as creator_email,
  u.role as creator_role,
  COUNT(*) as sale_count,
  SUM(s.total_amount) as total_amount
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
WHERE s.store_id IS NULL
GROUP BY u.email, u.role
ORDER BY sale_count DESC;

-- ============================================
-- STEP 5: CHECK SALE ITEMS FOR THESE SALES
-- ============================================
SELECT 
  '=== SALE ITEMS FOR NULL STORE_ID SALES ===' as section,
  si.sale_id,
  si.product_id,
  p.name as product_name,
  p.reference as product_reference,
  si.quantity,
  si.unit_price,
  si.total_price
FROM sale_items si
INNER JOIN sales s ON si.sale_id = s.id
LEFT JOIN products p ON si.product_id = p.id
WHERE s.store_id IS NULL
ORDER BY s.created_at DESC, si.created_at DESC
LIMIT 50;

-- ============================================
-- STEP 6: CHECK IF STORE EXISTS FOR THESE SALES
-- ============================================
-- This helps identify if we need to create a store or assign existing one
SELECT 
  '=== STORE CHECK FOR NULL STORE_ID SALES ===' as section,
  s.id as sale_id,
  s.sale_number,
  s.store_id,
  s.created_by,
  u.email as creator_email,
  u.store_id as user_store_id,
  st.name as user_store_name
FROM sales s
LEFT JOIN users u ON s.created_by = u.id
LEFT JOIN stores st ON u.store_id = st.id
WHERE s.store_id IS NULL
ORDER BY s.created_at DESC
LIMIT 20;

-- ============================================
-- STEP 7: RECOMMENDATION
-- ============================================
SELECT 
  '=== RECOMMENDATION ===' as section,
  CASE 
    WHEN EXISTS (SELECT 1 FROM sales WHERE store_id IS NULL AND created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com'))
    THEN 'Manager has sales with null store_id. You need to either: 1) Create a store and assign these sales to it, or 2) Assign manager to an existing store and update these sales.'
    WHEN EXISTS (SELECT 1 FROM sales WHERE store_id IS NULL)
    THEN 'There are sales with null store_id but not created by manager. Check who created them.'
    ELSE 'No sales with null store_id found.'
  END as recommendation;
