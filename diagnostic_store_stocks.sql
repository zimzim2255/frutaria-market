-- ============================================================
-- DIAGNOSTIC: Find products with missing or wrong store_stocks
-- ============================================================
-- This script identifies products that have quantity_available > 0 
-- but either:
-- 1. No store_stocks entry at all
-- 2. store_stocks entry with quantity = 0
-- ============================================================

-- PROBLEM 1: Products with NO store_stocks entry
-- These products exist but customers can't see them in stock lists
SELECT 
  p.id,
  p.reference,
  p.name,
  p.quantity_available,
  p.store_id,
  p.created_by,
  p.created_at,
  COUNT(ss.id) as store_stocks_count,
  'MISSING ENTRY' as issue_type
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
GROUP BY p.id, p.reference, p.name, p.quantity_available, p.store_id, p.created_by, p.created_at
HAVING COUNT(ss.id) = 0
ORDER BY p.created_at DESC;

-- PROBLEM 2: Products with store_stocks entry but quantity = 0
-- These products have entries but show 0 stock
SELECT 
  p.id,
  p.reference,
  p.name,
  p.quantity_available as product_quantity,
  ss.quantity as store_stock_quantity,
  p.store_id,
  ss.store_id as stock_store_id,
  p.created_at,
  'ZERO STOCK' as issue_type
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0 
  AND ss.quantity = 0
ORDER BY p.created_at DESC;

-- SUMMARY: How many products are affected?
SELECT 
  'Missing store_stocks entries' as issue,
  COUNT(*) as affected_count
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0
GROUP BY 1
HAVING COUNT(ss.id) = 0

UNION ALL

SELECT 
  'Zero quantity in store_stocks' as issue,
  COUNT(*) as affected_count
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available > 0 
  AND ss.quantity = 0;

-- BREAKDOWN: By store
SELECT 
  s.id,
  s.name,
  COUNT(DISTINCT p.id) as products_with_missing_stocks,
  SUM(p.quantity_available) as total_quantity_missing
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id
LEFT JOIN stores s ON p.store_id = s.id
WHERE p.quantity_available > 0
GROUP BY s.id, s.name
HAVING COUNT(ss.id) = 0
ORDER BY COUNT(DISTINCT p.id) DESC;
