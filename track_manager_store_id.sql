-- ============================================
-- TRACK MANAGER STORE ID FROM HISTORICAL DATA
-- ============================================
-- This script searches for footprints of manager mg811@gmail.com
-- across all tables to find which store they should be assigned to
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. GET MANAGER USER ID
-- ============================================
SELECT 
  '=== MANAGER USER INFO ===' as section,
  id as manager_id,
  email,
  role,
  store_id as current_store_id
FROM users 
WHERE email = 'mg811@gmail.com';

-- ============================================
-- 2. CHECK PRODUCTS CREATED BY MANAGER
-- ============================================
-- Products have created_by field that tracks who created them
SELECT 
  '=== PRODUCTS CREATED BY MANAGER ===' as section,
  p.id as product_id,
  p.name as product_name,
  p.reference,
  p.created_by,
  p.created_at,
  u.email as creator_email
FROM products p
LEFT JOIN users u ON p.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY p.created_at DESC
LIMIT 20;

-- ============================================
-- 3. CHECK STORE_STOCKS FOR PRODUCTS CREATED BY MANAGER
-- ============================================
-- If manager created products, they should be in a specific store
SELECT 
  '=== STORE STOCKS FOR MANAGER PRODUCTS ===' as section,
  ss.store_id,
  s.name as store_name,
  COUNT(DISTINCT ss.product_id) as product_count,
  SUM(ss.quantity) as total_quantity
FROM store_stocks ss
INNER JOIN products p ON ss.product_id = p.id
LEFT JOIN stores s ON ss.store_id = s.id
WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
GROUP BY ss.store_id, s.name
ORDER BY product_count DESC;

-- ============================================
-- 4. CHECK SALES CREATED BY MANAGER
-- ============================================
-- Sales table has created_by field
SELECT 
  '=== SALES CREATED BY MANAGER ===' as section,
  s.id as sale_id,
  s.store_id,
  st.name as store_name,
  s.created_by,
  s.created_at,
  u.email as creator_email
FROM sales s
LEFT JOIN stores st ON s.store_id = st.id
LEFT JOIN users u ON s.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR s.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY s.created_at DESC
LIMIT 20;

-- ============================================
-- 5. CHECK ORDERS CREATED BY MANAGER
-- ============================================
SELECT 
  '=== ORDERS CREATED BY MANAGER ===' as section,
  o.id as order_id,
  o.order_number,
  o.store_id,
  s.name as store_name,
  o.created_by,
  o.created_at,
  u.email as creator_email
FROM orders o
LEFT JOIN stores s ON o.store_id = s.id
LEFT JOIN users u ON o.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR o.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY o.created_at DESC
LIMIT 20;

-- ============================================
-- 6. CHECK INVOICES CREATED BY MANAGER
-- ============================================
SELECT 
  '=== INVOICES CREATED BY MANAGER ===' as section,
  i.id as invoice_id,
  i.invoice_number,
  i.store_id,
  s.name as store_name,
  i.created_at
FROM invoices i
LEFT JOIN stores s ON i.store_id = s.id
WHERE i.store_id IN (
  -- Get store_id from sales created by manager
  SELECT DISTINCT store_id 
  FROM sales 
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  UNION
  -- Get store_id from orders created by manager
  SELECT DISTINCT store_id 
  FROM orders 
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
)
ORDER BY i.created_at DESC
LIMIT 20;

-- ============================================
-- 7. CHECK STOCK HISTORY BY MANAGER
-- ============================================
SELECT 
  '=== STOCK HISTORY BY MANAGER ===' as section,
  sh.id as history_id,
  sh.product_id,
  p.name as product_name,
  sh.quantity_change,
  sh.reason,
  sh.created_by,
  sh.created_at,
  u.email as creator_email
FROM stock_history sh
LEFT JOIN products p ON sh.product_id = p.id
LEFT JOIN users u ON sh.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR sh.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY sh.created_at DESC
LIMIT 20;

-- ============================================
-- 8. CHECK PAYMENTS CREATED BY MANAGER
-- ============================================
SELECT 
  '=== PAYMENTS CREATED BY MANAGER ===' as section,
  pay.id as payment_id,
  pay.store_id,
  s.name as store_name,
  pay.amount,
  pay.created_by,
  pay.created_at,
  u.email as creator_email
FROM payments pay
LEFT JOIN stores s ON pay.store_id = s.id
LEFT JOIN users u ON pay.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR pay.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY pay.created_at DESC
LIMIT 20;

-- ============================================
-- 9. CHECK CHECKS (CHÈQUES) CREATED BY MANAGER
-- ============================================
SELECT 
  '=== CHECKS CREATED BY MANAGER ===' as section,
  c.id as check_id,
  c.check_number,
  c.store_id,
  s.name as store_name,
  c.amount,
  c.created_by,
  c.created_at,
  u.email as creator_email
FROM checks c
LEFT JOIN stores s ON c.store_id = s.id
LEFT JOIN users u ON c.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR c.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY c.created_at DESC
LIMIT 20;

-- ============================================
-- 10. CHECK EXPENSES CREATED BY MANAGER
-- ============================================
SELECT 
  '=== EXPENSES CREATED BY MANAGER ===' as section,
  e.id as expense_id,
  e.store_id,
  s.name as store_name,
  e.reason,
  e.amount,
  e.created_by,
  e.created_at,
  u.email as creator_email
FROM expenses e
LEFT JOIN stores s ON e.store_id = s.id
LEFT JOIN users u ON e.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR e.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY e.created_at DESC
LIMIT 20;

-- ============================================
-- 11. CHECK PRODUCT ADDITIONS HISTORY
-- ============================================
SELECT 
  '=== PRODUCT ADDITIONS HISTORY BY MANAGER ===' as section,
  pah.id as history_id,
  pah.product_id,
  p.name as product_name,
  pah.store_id,
  s.name as store_name,
  pah.quantite,
  pah.created_by,
  pah.created_at,
  u.email as creator_email
FROM product_additions_history pah
LEFT JOIN products p ON pah.product_id = p.id
LEFT JOIN stores s ON pah.store_id = s.id
LEFT JOIN users u ON pah.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR pah.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY pah.created_at DESC
LIMIT 20;

-- ============================================
-- 12. CHECK BON DE COMMANDE CREATED BY MANAGER
-- ============================================
-- NOTE: bon_commande table may not exist in your database
-- Uncomment this section if the table exists
/*
SELECT 
  '=== BON DE COMMANDE BY MANAGER ===' as section,
  bc.id as bon_commande_id,
  bc.bon_number,
  bc.store_id,
  s.name as store_name,
  bc.created_by,
  bc.created_at,
  u.email as creator_email
FROM bon_commande bc
LEFT JOIN stores s ON bc.store_id = s.id
LEFT JOIN users u ON bc.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR bc.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY bc.created_at DESC
LIMIT 20;
*/

-- ============================================
-- 13. CHECK FACTURES CREATED BY MANAGER
-- ============================================
-- NOTE: factures table may not exist in your database
-- Uncomment this section if the table exists
/*
SELECT 
  '=== FACTURES BY MANAGER ===' as section,
  f.id as facture_id,
  f.facture_number,
  f.store_id,
  s.name as store_name,
  f.created_by,
  f.created_at,
  u.email as creator_email
FROM factures f
LEFT JOIN stores s ON f.store_id = s.id
LEFT JOIN users u ON f.created_by = u.id
WHERE u.email = 'mg811@gmail.com'
   OR f.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
ORDER BY f.created_at DESC
LIMIT 20;
*/

-- ============================================
-- 14. AGGREGATE ALL STORE IDS FOUND
-- ============================================
-- This combines all store_ids found across all tables
SELECT 
  '=== ALL STORE IDS ASSOCIATED WITH MANAGER ===' as section,
  store_id,
  source,
  occurrence_count
FROM (
  -- From products created by manager
  SELECT 
    ss.store_id,
    'products_created' as source,
    COUNT(*) as occurrence_count
  FROM store_stocks ss
  INNER JOIN products p ON ss.product_id = p.id
  WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY ss.store_id
  
  UNION ALL
  
  -- From sales created by manager
  SELECT 
    store_id,
    'sales_created' as source,
    COUNT(*) as occurrence_count
  FROM sales
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
  
  UNION ALL
  
  -- From orders created by manager
  SELECT 
    store_id,
    'orders_created' as source,
    COUNT(*) as occurrence_count
  FROM orders
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
  
  UNION ALL
  
  -- From payments created by manager
  SELECT 
    store_id,
    'payments_created' as source,
    COUNT(*) as occurrence_count
  FROM payments
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
  
  UNION ALL
  
  -- From checks created by manager
  SELECT 
    store_id,
    'checks_created' as source,
    COUNT(*) as occurrence_count
  FROM checks
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
  
  UNION ALL
  
  -- From expenses created by manager
  SELECT 
    store_id,
    'expenses_created' as source,
    COUNT(*) as occurrence_count
  FROM expenses
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
  
  UNION ALL
  
  -- From product additions history
  SELECT 
    store_id,
    'product_additions' as source,
    COUNT(*) as occurrence_count
  FROM product_additions_history
  WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
  GROUP BY store_id
) AS all_stores
ORDER BY occurrence_count DESC;

-- ============================================
-- 15. RECOMMENDED STORE ASSIGNMENT
-- ============================================
-- This suggests which store to assign based on most frequent usage
SELECT 
  '=== RECOMMENDED STORE ASSIGNMENT ===' as section,
  store_id,
  s.name as store_name,
  total_occurrences,
  sources
FROM (
  SELECT 
    store_id,
    SUM(occurrence_count) as total_occurrences,
    STRING_AGG(DISTINCT source, ', ') as sources
  FROM (
    -- From products created by manager
    SELECT 
      ss.store_id,
      'products' as source,
      COUNT(*) as occurrence_count
    FROM store_stocks ss
    INNER JOIN products p ON ss.product_id = p.id
    WHERE p.created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
    GROUP BY ss.store_id
    
    UNION ALL
    
    -- From sales created by manager
    SELECT 
      store_id,
      'sales' as source,
      COUNT(*) as occurrence_count
    FROM sales
    WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
    GROUP BY store_id
    
    UNION ALL
    
    -- From orders created by manager
    SELECT 
      store_id,
      'orders' as source,
      COUNT(*) as occurrence_count
    FROM orders
    WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
    GROUP BY store_id
    
    UNION ALL
    
    -- From payments created by manager
    SELECT 
      store_id,
      'payments' as source,
      COUNT(*) as occurrence_count
    FROM payments
    WHERE created_by = (SELECT id FROM users WHERE email = 'mg811@gmail.com')
    GROUP BY store_id
  ) AS combined
  WHERE store_id IS NOT NULL
  GROUP BY store_id
) AS aggregated
LEFT JOIN stores s ON aggregated.store_id = s.id
ORDER BY total_occurrences DESC
LIMIT 1;

-- ============================================
-- 16. QUICK FIX: AUTO-ASSIGN MOST USED STORE
-- ============================================
-- Uncomment this to automatically assign the most frequently used store
/*
DO $$
DECLARE
  manager_id UUID;
  recommended_store_id UUID;
  store_name TEXT;
BEGIN
  -- Get manager's user ID
  SELECT id INTO manager_id FROM users WHERE email = 'mg811@gmail.com';
  
  IF manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager mg811@gmail.com not found in users table';
  END IF;
  
  -- Check if manager already has a store
  IF EXISTS (SELECT 1 FROM users WHERE id = manager_id AND store_id IS NOT NULL) THEN
    RAISE NOTICE 'Manager already has store_id: %', (SELECT store_id FROM users WHERE id = manager_id);
    RETURN;
  END IF;
  
  -- Find the most frequently used store by this manager
  SELECT 
    store_id,
    s.name
  INTO recommended_store_id, store_name
  FROM (
    SELECT 
      store_id,
      SUM(occurrence_count) as total_occurrences
    FROM (
      SELECT 
        ss.store_id,
        COUNT(*) as occurrence_count
      FROM store_stocks ss
      INNER JOIN products p ON ss.product_id = p.id
      WHERE p.created_by = manager_id
      GROUP BY ss.store_id
      
      UNION ALL
      
      SELECT 
        store_id,
        COUNT(*) as occurrence_count
      FROM sales
      WHERE created_by = manager_id
      GROUP BY store_id
      
      UNION ALL
      
      SELECT 
        store_id,
        COUNT(*) as occurrence_count
      FROM orders
      WHERE created_by = manager_id
      GROUP BY store_id
    ) AS combined
    WHERE store_id IS NOT NULL
    GROUP BY store_id
    ORDER BY total_occurrences DESC
    LIMIT 1
  ) AS most_used
  LEFT JOIN stores s ON most_used.store_id = s.id;
  
  IF recommended_store_id IS NULL THEN
    RAISE NOTICE 'No historical data found for manager. Creating new store...';
    
    -- Create a new store for the manager
    INSERT INTO stores (name, email, user_id, status)
    VALUES (
      'Magasin Manager - mg811@gmail.com',
      'mg811@gmail.com',
      manager_id,
      'active'
    )
    RETURNING id, name INTO recommended_store_id, store_name;
    
    RAISE NOTICE 'Created new store: % (ID: %)', store_name, recommended_store_id;
  ELSE
    RAISE NOTICE 'Found most used store: % (ID: %)', store_name, recommended_store_id;
  END IF;
  
  -- Update the manager's store_id
  UPDATE users 
  SET store_id = recommended_store_id,
      updated_at = NOW()
  WHERE id = manager_id;
  
  -- Also update the store's user_id if it's not set
  UPDATE stores 
  SET user_id = manager_id,
      updated_at = NOW()
  WHERE id = recommended_store_id AND user_id IS NULL;
  
  RAISE NOTICE 'Successfully assigned store % to manager %', recommended_store_id, manager_id;
END $$;
*/

-- ============================================
-- 17. VERIFICATION AFTER ASSIGNMENT
-- ============================================
-- Run this after assigning a store to verify
SELECT 
  '=== VERIFICATION ===' as section,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name,
  (SELECT COUNT(*) FROM store_stocks WHERE store_id = u.store_id) as products_in_store,
  (SELECT COUNT(*) FROM sales WHERE store_id = u.store_id) as sales_in_store,
  (SELECT COUNT(*) FROM orders WHERE store_id = u.store_id) as orders_in_store
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email = 'mg811@gmail.com';
