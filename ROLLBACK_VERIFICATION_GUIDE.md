# SQL ROLLBACK EXPLANATION AND VERIFICATION GUIDE

## PROBLEM SUMMARY
After running the SQL scripts (FIX_QUANTITY_AVAILABLE_PRODUCTION.sql, CREATE_QUANTITY_AVAILABLE_TRIGGER.sql), 
sales started incorrectly updating `number_of_boxes` instead of maintaining proper stock levels.

## ROOT CAUSE
The CREATE_QUANTITY_AVAILABLE_TRIGGER.sql created a trigger that:
- Set `quantity_available = number_of_boxes - total_sold`
- Treated `number_of_boxes` and `quantity_available` as the same thing

**This is incorrect** because:
- `products.quantity_available` = actual stock units (from store_stocks table)
- `products.number_of_boxes`   = packaging/container count (separate field)
- These are DIFFERENT fields with different purposes (see migration 146, product_additions_history)

The business logic:
- **Caisse** = quantity_available (current stock on hand)
- **Quantité** = number_of_boxes (number of boxes/units in inventory)

## WHAT THE ROLLBACK DOES

### 1. Removes the Problematic Trigger
```sql
DROP TRIGGER update_product_quantity_on_sale_change ON sales;
DROP TRIGGER update_product_quantity_on_sale_delete ON sales;
DROP FUNCTION fn_update_product_quantity_on_sale_change();
```
This prevents the incorrect recalculation of quantity_available from number_of_boxes.

### 2. Recalculates quantity_available from store_stocks
```sql
UPDATE products p
SET quantity_available = COALESCE(
    (SELECT SUM(ss.quantity) FROM store_stocks ss WHERE ss.product_id = p.id), 
    0
)
```
This ensures quantity_available reflects the actual stock (stored in store_stocks table).

### 3. Preserves number_of_boxes
The number_of_boxes field is left untouched (except fixing negative values), 
recognizing it's a separate field from quantity_available.

## STOCK MANAGEMENT IN THIS CODEBASE

### How Sales Currently Work (Correct Behavior)
1. Sales are created via POST /sales endpoint
2. Super-handler deducts stock from `store_stocks.quantity` based on `caisse` field
3. `products.quantity_available` should reflect SUM(store_stocks.quantity)
4. `products.number_of_boxes` is a separate field (not touched by sales)

### Key Code Locations
- `/supabase/functions/super-handler/index.ts` line 8335-8390
  - Handles stock deduction for normal sales
  - Uses `caisse` field, NOT `quantity` field
  - Updates `store_stocks.quantity` correctly

### Database Schema (Important Tables)
```sql
-- Main product table
products:
  - quantity_available  (stock units, should sync with store_stocks)
  - number_of_boxes     (packaging count, separate from stock)

-- Per-store inventory (SINGLE SOURCE OF TRUTH)
store_stocks:
  - product_id
  - store_id
  - quantity          (actual stock qty for this store)

-- Sales items with separate fields for different purposes
sale_items:
  - caisse             (stock movement, decrements store_stocks)
  - quantity           (kg/liter, does NOT decrement stock)
```

## VERIFICATION STEPS

### After Running the Rollback:

1. **Check POIRE TEMAS product**
```sql
SELECT reference, name, quantity_available, number_of_boxes,
       (SELECT SUM(quantity) FROM store_stocks 
        WHERE product_id = p.id) as store_total
FROM products p
WHERE reference = 'P272583484';
```
Expected: quantity_available should match store_stocks total

2. **Verify triggers are removed**
```sql
SELECT tgname, relname 
FROM pg_trigger t 
JOIN pg_class c ON t.tgrelid = c.oid
WHERE tgname LIKE '%quantity%';
```
Expected: No `update_product_quantity_on_sale_change` trigger

3. **Test a sale**
```sql
-- Create a test sale via the API
-- Check if store_stocks.quantity decreases
-- Check if products.quantity_available matches store_stocks total
```

4. **Check for discrepancies**
```sql
SELECT COUNT(*) as products_with_mismatch
FROM products p
WHERE ABS(COALESCE(quantity_available, 0) - 
    COALESCE((SELECT SUM(quantity) FROM store_stocks 
              WHERE product_id = p.id), 0)) > 0.01;
```
Expected: 0 (or very few if products have no store_stocks entry)

## RECOMMENDED FUTURE STATE

### Option A: Use store_stocks as Source of Truth (RECOMMENDED)
- Keep quantity_available in sync with SUM(store_stocks.quantity)
- Update via trigger or application logic
- Never set quantity_available = number_of_boxes - sales

### Option B: Calculate from Sales History
- Recalculate quantity_available = initial - total_sold
- But need to track initial quantity separately
- More complex, prone to errors

### Option C: Hybrid Approach (Current Direction)
- Use store_stocks for per-store inventory
- Use products.quantity_available as aggregate/computed field
- Use products.number_of_boxes for packaging info (separate)

## FILES PROVIDED

1. **ROLLBACK_QUANTITY_SQL_CHANGES.sql**
   - Complete rollback script
   - Includes safety backups
   - Verification queries

2. **Original SQL files (for reference)**
   - FIX_QUANTITY_AVAILABLE_PRODUCTION.sql
   - CREATE_QUANTITY_AVAILABLE_TRIGGER.sql
   - DIAGNOSTIC_QUANTITY_AVAILABLE_ISSUE.sql

## CRITICAL NOTES

⚠️ **DO NOT use**: `quantity_available = number_of_boxes - total_sold`
  - These are different fields with different meanings
  - number_of_boxes is NOT the initial stock quantity

✓ **DO use**: `quantity_available = SUM(store_stocks.quantity)`
  - store_stocks is the actual inventory table
  - Maintains per-store inventory correctly

✓ **Super-handler correctly**: 
  - Deducts store_stocks.quantity based on sale_items.caisse
  - Does NOT touch number_of_boxes
  - Maintains stock accuracy

## TESTING THE FIX

```sql
-- 1. Record current state
SELECT id, quantity_available, number_of_boxes 
FROM products WHERE id = 'test-product-id';

SELECT quantity FROM store_stocks 
WHERE product_id = 'test-product-id' AND store_id = 'test-store-id';

-- 2. Create a sale (via API or direct INSERT)
-- sale_items: caisse = 5, quantity = 2.5 (kg)

-- 3. After sale, verify:
-- a) store_stocks.quantity decreased by 5 (caisse, not kg)
-- b) quantity_available matches SUM(store_stocks)
-- c) number_of_boxes UNCHANGED

-- 4. Check no trigger interferes
-- The update should only come from super-handler (for API sales)
-- Or direct store_stocks updates
```

## ROLLBACK COMMAND

```bash
# Run in Supabase SQL editor:
psql -h <your-db-url> -f ROLLBACK_QUANTITY_SQL_CHANGES.sql

# Or execute directly in Supabase dashboard SQL editor
```

## SUPPORT

If issues persist after rollback:
1. Check store_stocks table has correct data
2. Verify super-handler is running (for API sales)
3. Ensure no other triggers modify products.quantity_available
4. Review sale_items for correct caisse vs quantity values

---
**Last Updated**: 2026-04-28
**Status**: Rollback script created and tested
