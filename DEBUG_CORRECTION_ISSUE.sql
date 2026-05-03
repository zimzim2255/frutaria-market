-- ============================================================================
-- STEP 1: VERIFY THE DISCREPANCY STILL EXISTS
-- ============================================================================

-- Check the specific POIRE TEMAS product
SELECT 
    id,
    reference,
    name,
    quantity_available,
    number_of_boxes,
    store_id,
    created_at
FROM products
WHERE reference = 'P272583484'
  AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76';


-- ============================================================================
-- STEP 2: MANUALLY CHECK SALES FOR THIS PRODUCT
-- ============================================================================

-- Get the product ID first, then check sales
WITH product_info AS (
    SELECT id, store_id
    FROM products
    WHERE reference = 'P272583484'
      AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76'
)
SELECT 
    (p.id) as product_id,
    s.id as sale_id,
    s.created_at,
    s.items,
    jsonb_array_length(s.items) as num_items
FROM product_info p
JOIN sales s ON s.store_id = p.store_id
WHERE s.items @> jsonb_build_array(jsonb_build_object('product_id', p.id::text))
   OR s.items::text LIKE '%' || p.id::text || '%'
LIMIT 10;


-- ============================================================================
-- STEP 3: CHECK SALES.ITEMS STRUCTURE FOR PRODUCT
-- ============================================================================

-- Shows exact structure of items in sales
WITH product_info AS (
    SELECT id, store_id
    FROM products
    WHERE reference = 'P272583484'
)
SELECT 
    s.id as sale_id,
    s.items,
    jsonb_pretty(s.items) as items_pretty
FROM product_info p
JOIN sales s ON s.store_id = p.store_id
LIMIT 3;


-- ============================================================================
-- STEP 4: COUNT PRODUCTS WITH ANY QUANTITY MISMATCH
-- ============================================================================

-- Show first 10 products with ANY discrepancy
SELECT 
    p.id,
    p.reference,
    p.name,
    p.quantity_available,
    p.number_of_boxes,
    (SELECT COUNT(*)::int FROM sales s WHERE s.store_id = p.store_id) as num_sales,
    p.store_id
FROM products p
WHERE p.quantity_available IS NOT NULL
  OR p.number_of_boxes IS NOT NULL
ORDER BY p.created_at DESC
LIMIT 10;


-- ============================================================================
-- STEP 5: CHECK IF TRIGGER FUNCTIONS EXIST NOW
-- ============================================================================

SELECT 
    trigger_name, 
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE trigger_name LIKE '%quantity%'
   OR event_object_table = 'sales';
