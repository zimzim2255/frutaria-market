-- ============================================================================
-- ROLLBACK SCRIPT: Reverse Incorrect Stock Management SQL Changes
-- ============================================================================
-- Purpose: Revert the SQL changes that broke inventory logic where sales
--          were incorrectly updating number_of_boxes instead of stock levels
-- Date: 2026-04-28
-- ============================================================================
-- PROBLEM: CREATE_QUANTITY_AVAILABLE_TRIGGER.sql created triggers that:
--   1. Used number_of_boxes as "initial quantity" (incorrect - it's packaging)
--   2. Subtracted item quantity (kg/liter) instead of caisse (count)
--   3. Set quantity_available = number_of_boxes - quantity (mixing units!)
--
-- CORRECT BEHAVIOR:
--   - quantity_available = stock units (from store_stocks table)
--   - number_of_boxes = packaging count (separate field, not stock)
--   - caisse = box count for stock movement (decrements store_stocks)
--   - quantity = kg/liter weight (does NOT decrement stock)
-- ============================================================================

-- ============================================================================
-- STEP 0: Backup current state (SAFETY)
-- ============================================================================
CREATE TEMP TABLE IF NOT EXISTS rollback_backup_pre AS
SELECT 
    'PRE-ROLLBACK STATE' as backup_label,
    COUNT(*) as product_count,
    SUM(quantity_available) as total_qty_available,
    SUM(number_of_boxes) as total_boxes
FROM products;

SELECT * FROM rollback_backup_pre;

-- Also backup products table
CREATE TABLE IF NOT EXISTS products_backup_rollback_20260428 AS 
SELECT * FROM products;

-- ============================================================================
-- STEP 1: DROP the problematic trigger (from CREATE_QUANTITY_AVAILABLE_TRIGGER.sql)
-- ============================================================================
-- The trigger incorrectly recalculates quantity_available = number_of_boxes - sales
-- This is wrong because quantity_available and number_of_boxes are different fields!
-- ============================================================================

DROP TRIGGER IF EXISTS update_product_quantity_on_sale_change ON sales;
DROP TRIGGER IF EXISTS update_product_quantity_on_sale_delete ON sales;
DROP FUNCTION IF EXISTS fn_update_product_quantity_on_sale_change();

SELECT 'Triggers dropped successfully' as rollback_step;

-- ============================================================================
-- STEP 2: Revert quantity_available to correct values
-- ============================================================================
-- The FIX_QUANTITY_AVAILABLE_PRODUCTION.sql set:
--   quantity_available = number_of_boxes - total_sold
--
-- This is INCORRECT because:
--   - quantity_available: actual stock units (from store_stocks or manual tracking)
--   - number_of_boxes: packaging/box count (separate field)
--
-- Instead, quantity_available should be recalculated from the sales history
-- OR restored from a proper baseline.
--
-- Since the system stores actual stock movements in store_stocks table,
-- we calculate quantity_available from there (per migration 026 guidance).
-- ============================================================================

-- Option A: Recalculate from store_stocks (recommended - single source of truth)
-- This assumes store_stocks has the correct per-store quantities
-- and we want products.quantity_available to reflect total across all stores

BEGIN TRANSACTION;

UPDATE products p
SET quantity_available = COALESCE(
    (SELECT SUM(ss.quantity) 
     FROM store_stocks ss 
     WHERE ss.product_id = p.id), 
    0
)::decimal(15,2),
updated_at = CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM store_stocks ss WHERE ss.product_id = p.id
);

SELECT 'Quantity available recalculated from store_stocks' as rollback_step;

-- For products without store_stocks entries, preserve current value
-- or set to 0 if it looks obviously wrong (e.g., negative)

UPDATE products
SET quantity_available = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE quantity_available < 0;

SELECT 'Negative quantities corrected to 0' as rollback_step;

COMMIT;

-- ============================================================================
-- STEP 3: Verify number_of_boxes integrity
-- ============================================================================
-- Ensure number_of_boxes is not corrupted (should never be negative)
-- ============================================================

UPDATE products
SET number_of_boxes = 0
WHERE number_of_boxes < 0;

SELECT 'Number of boxes negative values corrected' as rollback_step;

-- ============================================================================
-- STEP 4: Verification queries
-- ============================================================================

-- Show the POIRE TEMAS product as a key example
SELECT 
    'POIRE TEMAS Verification' as check_type,
    reference,
    name,
    quantity_available,
    number_of_boxes,
    (SELECT COALESCE(SUM(ss.quantity), 0) 
     FROM store_stocks ss 
     WHERE ss.product_id = p.id) as store_stocks_total
FROM products p
WHERE reference = 'P272583484'
  AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76';

-- Show all corrections made during this rollback
SELECT 
    'ROLLBACK CORRECTIONS' as log_type,
    p.id,
    p.reference,
    p.name,
    b.total_qty_available as old_qty_available,
    p.quantity_available as new_qty_available,
    (p.quantity_available - b.total_qty_available) as qty_change
FROM products p
CROSS JOIN rollback_backup_pre b
WHERE p.quantity_available != b.total_qty_available
   OR p.quantity_available IS DISTINCT FROM b.total_qty_available
LIMIT 50;

-- Count affected products
SELECT 
    'SUMMARY' as report_type,
    COUNT(*) as total_products,
    COUNT(CASE WHEN quantity_available != COALESCE(
        (SELECT SUM(ss.quantity) FROM store_stocks ss WHERE ss.product_id = products.id), 0)
        THEN 1 END) as products_recalculated,
    SUM(quantity_available) as total_qty_available_now,
    SUM(number_of_boxes) as total_boxes_now
FROM products;

-- ============================================================================
-- STEP 5: Check for trigger removal confirmation
-- ============================================================================

SELECT 
    'TRIGGER STATUS' as check_type,
    tgname as trigger_name,
    relname as table_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE tgname LIKE '%quantity%'
   OR tgname LIKE '%stock%';

-- Should NOT show update_product_quantity_on_sale_change

-- ============================================================================
-- STEP 6: Recommended next steps
-- ============================================================================

SELECT 
    'NEXT STEPS' as action_required,
    '1. Verify store_stocks table has correct per-store quantities' as step_1,
    '2. Test a sale to confirm it updates store_stocks.quantity correctly' as step_2,
    '3. Do NOT set quantity_available = number_of_boxes - sales (they are different fields)' as step_3,
    '4. Consider using store_stocks as single source of truth for stock' as step_4,
    '5. Products.quantity_available should sync with SUM(store_stocks.quantity)' as step_5;

-- ============================================================================
-- ROLLBACK COMPLETE
-- ============================================================================
-- The problematic trigger has been removed.
-- quantity_available has been recalculated from store_stocks (correct values).
-- number_of_boxes is preserved as a separate field (not overwritten by stock logic).
-- ============================================================================
