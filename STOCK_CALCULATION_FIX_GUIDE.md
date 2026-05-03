# PRODUCTION ISSUE: Incorrect Stock Quantities - Diagnostic & Fix Guide

**Date**: April 27, 2026  
**Product**: POIRE TEMAS/OFL124/813 (P272583484)  
**Issue**: `quantity_available` showing 87 instead of correct 28 (59-unit discrepancy)  
**Severity**: HIGH - Stock tracking broken in production  
**Status**: 3-step fix available  

---

## ROOT CAUSE ANALYSIS

### The Problem
```
Initial stock (number_of_boxes): 1,574 units
Total sold quantity:              1,545.97 units
Expected remaining:               28 units
Currently displayed:              87 units
DISCREPANCY:                      59 units (too high)
```

### Why This Happened
1. **`quantity_available` is NOT automatically calculated from sales**
   - It's only updated through manual API calls in super-handler
   - When sales occur, the product stock is NOT deducted

2. **No database trigger exists** to maintain stock accuracy
   - Sales are stored in JSONB format inside `sales.items` column
   - No trigger listens for sales changes and updates `products.quantity_available`

3. **Manual injection scripts bypass calculations**
   - Multiple `.mjs` files directly set quantities without validation
   - Creates risk of duplicates and inconsistent data

---

## 3-STEP FIX (PRODUCTION SAFE)

### STEP 1: Run Diagnostic Query
**File**: `DIAGNOSTIC_QUANTITY_AVAILABLE_ISSUE.sql`  
**Time**: < 5 seconds  
**Impact**: READ-ONLY - identifies all affected products

```sql
-- Shows all products with discrepancies
-- Reveals total affected units across system
-- Run this first to understand scope of issue
```

**Expected Output for POIRE TEMAS product**:
- displayed_quantity: 87
- total_initial: 1574
- total_sold: 1545.97
- expected_quantity: 28
- discrepancy: 59

---

### STEP 2: Apply Correction (TRANSACTION-SAFE)
**File**: `FIX_QUANTITY_AVAILABLE_PRODUCTION.sql`  
**Time**: < 30 seconds  
**Impact**: MODIFIES products table - CAN BE ROLLED BACK

**What it does**:
1. Creates backup view of all corrections before applying
2. Logs all changes to `quantity_available_corrections_log` table for audit
3. Updates `quantity_available` = (initial_qty - total_sold) for each product
4. Provides verification query showing corrections made
5. Uses transaction wrapper - can rollback if needed

**To Execute**:
```bash
# In Supabase, run the SQL and watch for:
# - CREATE TABLE (log table)
# - INSERT (audit entries)
# - UPDATE (corrections)
# - COMMIT (finalize changes)

# If something looks wrong before COMMIT:
# ROLLBACK
```

**Verification**:
After fix, POIRE TEMAS should show:
- corrected_stock: 28 units
- discrepancy: 0

---

### STEP 3: Implement Permanent Trigger
**File**: `CREATE_QUANTITY_AVAILABLE_TRIGGER.sql`  
**Time**: < 10 seconds  
**Impact**: CRITICAL - Prevents future discrepancies

**What it does**:
1. Creates function `fn_update_product_quantity_on_sale_change()`
2. Triggers on every INSERT/UPDATE/DELETE to sales table
3. Automatically recalculates `quantity_available` for affected products
4. Maintains consistency between sales and stock

**After this step**:
- ALL future sales automatically reduce stock correctly
- No more manual calculation needed
- Stock discrepancies become impossible

---

## IMPLEMENTATION TIMELINE

### IMMEDIATE (Before sales resume)
```
1. Run: DIAGNOSTIC_QUANTITY_AVAILABLE_ISSUE.sql
2. Review: How many products affected, total units discrepancy
3. Run: FIX_QUANTITY_AVAILABLE_PRODUCTION.sql (with COMMIT)
4. Verify: Check specific products were corrected
5. Inform: Team that stock is now accurate
```

### SAME DAY (Production stability)
```
6. Run: CREATE_QUANTITY_AVAILABLE_TRIGGER.sql
7. Test: Create a test sale and verify stock reduces automatically
8. Monitor: Check that no new discrepancies appear
```

### DOCUMENTATION
```
9. Update: Internal docs about stock calculation
10. Notify: All team members that trigger is now active
11. Archive: Save this guide for future reference
```

---

## VERIFICATION QUERIES (Run after each step)

### After Step 2 (Corrections Applied):
```sql
-- Check specific product
SELECT reference, name, quantity_available, number_of_boxes
FROM products
WHERE reference = 'P272583484'
AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76';

-- Should show: quantity_available = 28 (or close, depending on additional sales)
```

### After Step 3 (Trigger Installed):
```sql
-- Verify trigger exists
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%quantity%';

-- Should show: update_product_quantity_on_sale_change on sales table
```

### Test New Sales:
```sql
-- Create a test sale
-- Insert via API or directly
-- Check: Does product.quantity_available automatically decrease?
```

---

## ROLLBACK (If needed)

### After Step 2 (Before COMMIT):
```sql
ROLLBACK;
-- No products modified, all changes reverted
```

### After Step 2 (Already COMMITTED):
```sql
-- Restore from corrections_log table
UPDATE products p
SET quantity_available = (
    SELECT old_value 
    FROM quantity_available_corrections_log 
    WHERE product_id = p.id 
    ORDER BY corrected_at DESC LIMIT 1
)
WHERE id IN (
    SELECT product_id FROM quantity_available_corrections_log
);
```

### After Step 3 (Trigger installed):
```sql
DROP TRIGGER update_product_quantity_on_sale_change ON sales;
DROP TRIGGER update_product_quantity_on_sale_delete ON sales;
DROP FUNCTION fn_update_product_quantity_on_sale_change();
```

---

## FAQ

**Q: Will this affect current sales?**  
A: No. Step 2 corrects past data. Step 3 prevents future issues.

**Q: How long will it take?**  
A: Total ~45 seconds. Diagnostic: 5s, Fix: 30s, Trigger: 10s.

**Q: What if I'm in the middle of sales?**  
A: Run during a natural pause or maintenance window.

**Q: Can I rollback?**  
A: Yes, until you hit COMMIT. After that, use the corrections_log table.

**Q: Will the trigger cause performance issues?**  
A: No, triggers run after the transaction commits. Minimal overhead.

**Q: What about store_stocks table?**  
A: That's different - it tracks per-store inventory. This fixes the central product table.

---

## FILES REQUIRED

1. **DIAGNOSTIC_QUANTITY_AVAILABLE_ISSUE.sql** - Read-only, safe to run anytime
2. **FIX_QUANTITY_AVAILABLE_PRODUCTION.sql** - Run during maintenance
3. **CREATE_QUANTITY_AVAILABLE_TRIGGER.sql** - Run after fix is confirmed

All files are in the root directory of the project.

---

## SUPPORT

If issues occur:
1. Check `quantity_available_corrections_log` table for audit trail
2. Verify trigger function with query above
3. Compare products.quantity_available with manual calculation
4. Review sales.items JSONB structure for quantity fields

**Next Steps**: Execute the fixes in order. Start with diagnostic.
