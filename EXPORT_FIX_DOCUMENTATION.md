# Export Issue Fix - Stock Partagé - Échange Inter-Magasins

## Problem Identified

The export functionality (Excel & PDF) on the "Stock Partagé - Échange Inter-Magasins" page was showing **incorrect quantities** for products.

### Root Cause

The display table showed **store-specific quantities** from `product.store_stocks[store_id]`:
- Example: Product shows `104` in mg76 store column, `208` in another store

However, the export function was using `product.quantity_available`:
- This is the **total merged quantity across ALL stores** (312 in the example)
- Not the store-specific quantity being displayed

This mismatch caused exports to show wrong data for specific products.

### Technical Details

**Display vs Export Data Source:**
```
Display (Correct):
- Shows: product.store_stocks[store_id] = 104 (store-specific)

Export (Was Incorrect):
- Exported: product.quantity_available = 312 (global total)
```

## Solution Implemented

Added a helper function `getExportQuantity()` that determines the correct quantity based on context:

```javascript
const getExportQuantity = (product: any): number => {
  const isAdminRole = String(effectiveUserRole || 'user').toLowerCase() === 'admin';
  
  // If admin with a specific store filtered
  if (isAdminRole && storeFilter !== 'all' && product.store_stocks) {
    const storeSpecificQty = product.store_stocks[String(storeFilter)];
    if (storeSpecificQty !== undefined && storeSpecificQty !== null) {
      return Number(storeSpecificQty);
    }
  }
  
  // If non-admin with a store assigned, use store-specific quantity
  if (!isAdminRole && effectiveUserStoreId && product.store_stocks) {
    const storeSpecificQty = product.store_stocks[String(effectiveUserStoreId)];
    if (storeSpecificQty !== undefined && storeSpecificQty !== null) {
      return Number(storeSpecificQty);
    }
  }
  
  // Fallback to global quantity
  return Number(product.quantity_available ?? 0);
};
```

### Updated Functions
1. **handleExportExcel()** - Uses `getExportQuantity()` to get correct store-specific quantities
2. **handleExportPDF()** - Uses `getExportQuantity()` to get correct store-specific quantities

## Export Behavior After Fix

### For Store Managers
- Export shows their store's specific quantities (e.g., mg76: 104)
- Quantities match what they see in the table

### For Admins with Store Filter
- When filtering by store (e.g., "mg76"), export shows that store's quantities
- Respects the admin-selected magasin context

### For Admins Viewing All Stores
- When viewing "all stores", export falls back to global `quantity_available`
- Shows total across all stores

## Changed Files
- [src/components/modules/ProductsModule.tsx](src/components/modules/ProductsModule.tsx#L1800-L1970)
  - Added `getExportQuantity()` helper function
  - Updated `handleExportExcel()` 
  - Updated `handleExportPDF()`

## Testing Recommendations

1. **As a Store Manager (e.g., mg76):**
   - View product in table (should show store-specific qty)
   - Select products and export to Excel
   - Verify exported quantity matches displayed quantity

2. **As Admin with Store Filter:**
   - Select a specific magasin (e.g., mg76)
   - Select products
   - Export should show selected store's quantities

3. **As Admin Viewing All Stores:**
   - Don't filter by store (keep "all magasins")
   - Export should show total global quantities

## Example Fix Verification

**Before Fix:**
- User sees: 104 (mg76 store stock)
- Export showed: 312 (total global stock) ❌

**After Fix:**
- User sees: 104 (mg76 store stock)
- Export shows: 104 (correct store-specific stock) ✅
