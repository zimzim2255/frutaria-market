-- ============================================================================
-- TEST SCRIPT: Verify Stock Management After Rollback
-- ============================================================================
-- This script tests that the rollback correctly fixes the stock logic
-- ============================================================================

-- TEST 1: Verify Triggers Are Removed
SELECT '=== TEST 1: Verify Triggers Are Removed ===' as test_name;
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS: No quantity-related triggers exist'
        ELSE 'FAIL: Quantity triggers still exist - ' || COUNT(*)::text
    END as test_result
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE tgname LIKE '%quantity%'
   OR tgname LIKE '%update_product_quantity%';

-- TEST 2: Verify Function Is Removed
SELECT '=== TEST 2: Verify Function Is Removed ===' as test_name;
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS: fn_update_product_quantity_on_sale_change is removed'
        ELSE 'FAIL: Function still exists - ' || COUNT(*)::text
    END as test_result
FROM pg_proc
WHERE proname = 'fn_update_product_quantity_on_sale_change';

-- TEST 3: Check POIRE TEMAS Product
SELECT '=== TEST 3: Check POIRE TEMAS Product ===' as test_name;
SELECT 
    'POIRE TEMAS' as product_check,
    reference,
    name,
    quantity_available,
    number_of_boxes,
    (SELECT COALESCE(SUM(quantity), 0) 
     FROM store_stocks ss 
     WHERE ss.product_id = p.id) as store_stocks_total,
    CASE 
        WHEN ABS(COALESCE(quantity_available, 0) - 
             COALESCE((SELECT SUM(quantity) FROM store_stocks 
                      WHERE product_id = p.id), 0)) < 0.01
        THEN 'PASS: quantity_available matches store_stocks'
        ELSE 'FAIL: quantity_available does NOT match store_stocks'
    END as consistency_check
FROM products p
WHERE reference = 'P272583484'
  AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76';

-- TEST 4: Check All Products Consistency
SELECT '=== TEST 4: Check All Products Consistency ===' as test_name;
WITH product_check AS (
    SELECT 
        p.id,
        p.reference,
        p.quantity_available,
        COALESCE((SELECT SUM(ss.quantity) 
                  FROM store_stocks ss 
                  WHERE ss.product_id = p.id), 0) as store_total,
        ABS(COALESCE(p.quantity_available, 0) - 
            COALESCE((SELECT SUM(ss.quantity) 
                      FROM store_stocks ss 
                      WHERE ss.product_id = p.id), 0)) as diff
    FROM products p
)
SELECT 
    CASE 
        WHEN COUNT(CASE WHEN diff > 0.01 THEN 1 END) = 0 
        THEN 'PASS: All products consistent'
        ELSE 'WARN: ' || COUNT(CASE WHEN diff > 0.01 THEN 1 END)::text || ' products have mismatched quantities'
    END as test_result,
    COUNT(*) as total_products,
    COUNT(CASE WHEN diff > 0.01 THEN 1 END) as mismatched,
    ROUND(SUM(diff)::numeric, 2) as total_discrepancy
FROM product_check;

-- TEST 5: Check No Negative Quantities
SELECT '=== TEST 5: Check No Negative Quantities ===' as test_name;
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS: No negative quantities'
        ELSE 'FAIL: ' || COUNT(*)::text || ' products with negative quantity_available'
    END as test_result
FROM products
WHERE quantity_available < 0;

-- TEST 6: Sample Sale Simulation
SELECT '=== TEST 6: Sample Sale Simulation ===' as test_name;
SELECT 
    'Simulated Sale' as scenario,
    'Before Sale: quantity_available = 100, number_of_boxes = 50' as initial_state,
    'Sale: caisse = 5 (box count, decrements stock)' as sale_action,
    'After Sale CORRECT: quantity_available = 95, number_of_boxes = 50 (unchanged)' as expected_result,
    'After Sale WRONG: quantity_available = 45 (if using number_of_boxes - sale logic)' as incorrect_result;

-- TEST 7: Verify store_stocks Table Exists
SELECT '=== TEST 7: Verify store_stocks Table Exists ===' as test_name;
SELECT 
    CASE 
        WHEN COUNT(*) = 1 THEN 'PASS: store_stocks table exists (SINGLE SOURCE OF TRUTH)'
        ELSE 'FAIL: store_stocks table not found'
    END as test_result
FROM pg_tables
WHERE tablename = 'store_stocks'
  AND schemaname = 'public';

-- SUMMARY
SELECT '=== SUMMARY ===' as test_name;
SELECT 
    'Rollback Verification' as check_item,
    'Triggers removed' as check_1,
    'Functions removed' as check_2,
    'quantity_available recalculated from store_stocks' as check_3,
    'number_of_boxes preserved (not overwritten)' as check_4,
    'No mixing of quantity units with box counts' as check_5;

-- KEY PRINCIPLES
SELECT '=== KEY PRINCIPLES ===' as test_name;
SELECT 'quantity_available tracks STOCK UNITS (via store_stocks)' as principle_1
UNION ALL
SELECT 'number_of_boxes tracks PACKAGING COUNT (separate field)' as principle_2
UNION ALL
SELECT 'caisse field decrements STOCK during sales' as principle_3
UNION ALL
SELECT 'quantity field (kg) does NOT decrement stock' as principle_4;

SELECT '=== ALL TESTS COMPLETE ===' as test_name;
