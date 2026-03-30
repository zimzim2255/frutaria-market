# Manager Data Visibility Issue - Diagnosis and Fix

## Problem Description

When logging in as manager `mg811@gmail.com`, no data is displayed (products, stores, etc.), but when logging in as admin, the data for that manager's store is visible.

## Root Cause

The manager user has `store_id: null` in the `users` table. The super-handler edge function has security logic that prevents non-admin users from seeing data if they don't have a `store_id` assigned:

```typescript
// From supabase/functions/super-handler/index.ts (lines 1738-1740)
if (!effectiveStoreId) {
  // No magasin => no stock visibility
  return jsonResponse({ products: [], stores: [] });
}
```

## Console Log Evidence

From the browser console:
```
Current user: 
Object { id: "a11bcfee-f649-47d0-9c76-fe17a1446494", email: "mg811@gmail.com", role: "manager", store_id: null, permissions: (80) […] }
```

The `store_id: null` is the problem!

## Solution

### Step 1: Run Diagnostic Script

First, run `diagnose_manager_data.sql` in Supabase SQL Editor to understand the current state:

```sql
-- This will show:
-- 1. Manager user details
-- 2. All stores in the system
-- 3. Store stocks distribution
-- 4. Whether manager has any store assigned
```

### Step 2: Track Store ID from Historical Data (RECOMMENDED)

Run `track_manager_store_id.sql` to find the manager's store by tracking footprints across all tables:

```sql
-- This script searches for the manager's store_id by checking:
-- 1. Products created by the manager
-- 2. Sales created by the manager
-- 3. Orders created by the manager
-- 4. Payments created by the manager
-- 5. Checks created by the manager
-- 6. Expenses created by the manager
-- 7. Stock history by the manager
-- 8. Product additions history by the manager
```

The script will show:
- All store IDs associated with the manager across different tables
- A recommended store assignment based on most frequent usage
- Option to auto-assign the most used store

### Step 3: Run Fix Script

After reviewing the tracking results, run `create_and_assign_store.sql`:

This script:
1. Checks if the store exists
2. Creates the store if it doesn't exist
3. Assigns the store to the manager
4. Verifies the assignment was successful

### Step 4: Verify the Fix

The fix script includes verification queries that will show:
- Manager's assigned store
- Number of products visible to the manager
- Store stocks available

### Step 5: Test in Application

After running the fix:
1. Log out from the manager account
2. Log back in as manager `mg811@gmail.com`
3. The products and stores should now be visible

## How the System Works

### User Roles and Store Assignment

1. **Admin**: Can see all stores and products
   - If `store_id` is set, sees only that store's products
   - If `store_id` is null, sees all products

2. **Manager/User**: Can only see their assigned store
   - Must have `store_id` set in `users` table
   - If `store_id` is null, sees nothing (security feature)

### Data Flow

```
User Login
    ↓
Super-handler checks user.role and user.store_id
    ↓
If non-admin and store_id is null → Return empty data
    ↓
If non-admin and store_id is set → Query store_stocks for that store
    ↓
Return products that exist in that store's stock
```

## Files Created

1. **diagnose_manager_data.sql** - Diagnostic queries to understand current state
2. **track_manager_store_id.sql** - Track store_id from historical data (RECOMMENDED)
3. **create_and_assign_store.sql** - Fix script to create and assign store to manager
4. **check_store_data.sql** - Diagnostic script to check store data after assignment
5. **MANAGER_DATA_ISSUE_README.md** - This documentation

## Additional Notes

### Why Admin Can See Data

The admin user likely has:
- A `store_id` assigned, OR
- The super-handler returns all products when admin has no `store_id` (line 1729-1736)

### Store Stocks Table

Products are linked to stores via the `store_stocks` table:
- Each row represents a product's stock in a specific store
- The super-handler filters products by checking which products exist in the user's store

### Security Feature

The requirement for non-admin users to have a `store_id` is intentional:
- Prevents users from seeing other stores' data
- Ensures data isolation between different stores/magasins
- Managers should only see their own store's inventory

## Troubleshooting

### If manager still can't see data after fix:

1. **Check store_stocks table**: Ensure the assigned store has products in `store_stocks`
   ```sql
   SELECT * FROM store_stocks WHERE store_id = 'MANAGER_STORE_ID';
   ```

2. **Check products table**: Ensure products exist
   ```sql
   SELECT COUNT(*) FROM products;
   ```

3. **Clear browser cache**: The app might be caching old data

4. **Check super-handler logs**: Look for any errors in Supabase dashboard

5. **Run check_store_data.sql**: This will show if the store has any data

### If store has no data:

If the store was just created, it won't have any products. You need to either:
1. Add products to this store, OR
2. Assign the manager to an existing store that has data

To find stores with data:
```sql
SELECT 
  s.id,
  s.name,
  COUNT(DISTINCT ss.product_id) as product_count
FROM stores s
LEFT JOIN store_stocks ss ON s.id = ss.store_id
GROUP BY s.id, s.name
HAVING COUNT(DISTINCT ss.product_id) > 0
ORDER BY product_count DESC;
```

Then assign the manager to a store with data:
```sql
UPDATE users 
SET store_id = 'STORE_ID_WITH_DATA',
    updated_at = NOW()
WHERE email = 'mg811@gmail.com';
```

### If you need to reassign manager to different store:

```sql
UPDATE users 
SET store_id = 'NEW_STORE_ID',
    updated_at = NOW()
WHERE email = 'mg811@gmail.com';
```

## Related Code Files

- `supabase/functions/super-handler/index.ts` - Edge function handling data requests
- `src/components/modules/ProductsModule.tsx` - Frontend products display
- `src/components/AdminDashboard.tsx` - Admin dashboard
- `src/components/LoginScreen.tsx` - Login handling
