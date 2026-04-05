-- ============================================================
-- FIX: Update 437 broken store_stocks entries (quantity = 0)
-- ============================================================
-- These store_stocks rows exist but have quantity = 0
-- We need to set them to match products.quantity_available
-- ============================================================

-- FIRST: Let's verify the problem one more time
SELECT COUNT(*) as broken_store_stocks_count
FROM store_stocks ss
WHERE ss.quantity = 0
  AND EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = ss.product_id 
      AND p.quantity_available > 0
  );

-- THEN: Fix them - UPDATE store_stocks to match products.quantity_available
UPDATE store_stocks ss
SET quantity = p.quantity_available,
    updated_at = NOW()
FROM products p
WHERE ss.product_id = p.id
  AND ss.quantity = 0
  AND p.quantity_available > 0;

-- VERIFY: Check how many were fixed
SELECT COUNT(*) as fixed_count
FROM store_stocks ss
WHERE ss.quantity > 0
  AND EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = ss.product_id 
      AND p.quantity_available = ss.quantity
  );

-- FINAL CHECK: Confirm no more broken entries
SELECT 
  'Broken entries remaining' as status,
  COUNT(*) as count
FROM store_stocks ss
WHERE ss.quantity = 0
  AND EXISTS (
    SELECT 1 FROM products p 
    WHERE p.id = ss.product_id 
      AND p.quantity_available > 0
  );

-- Show some examples of what was fixed
SELECT 
  p.reference,
  p.name,
  p.quantity_available,
  ss.quantity,
  p.created_by,
  'FIXED' as status
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
WHERE p.quantity_available = ss.quantity
  AND p.quantity_available > 0
LIMIT 20;
