-- ============================================
-- FIX SCRIPT: ASSIGN STORE TO MANAGER
-- ============================================
-- This script assigns a store to manager mg811@gmail.com
-- Run this AFTER running diagnose_manager_data.sql
-- 
-- IMPORTANT: Review the diagnostic results first!
-- If the manager already has a store, you may need to update the store_id instead.

-- ============================================
-- OPTION 1: CREATE A NEW STORE FOR THE MANAGER
-- ============================================
-- Uncomment this section if the manager needs a new store

/*
DO $$
DECLARE
  manager_id UUID;
  new_store_id UUID;
BEGIN
  -- Get manager's user ID
  SELECT id INTO manager_id FROM users WHERE email = 'mg811@gmail.com';
  
  IF manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager mg811@gmail.com not found in users table';
  END IF;
  
  -- Create a new store for the manager
  INSERT INTO stores (name, email, user_id, status)
  VALUES (
    'Magasin Manager - mg811@gmail.com',
    'mg811@gmail.com',
    manager_id,
    'active'
  )
  RETURNING id INTO new_store_id;
  
  -- Update the manager's store_id
  UPDATE users 
  SET store_id = new_store_id,
      updated_at = NOW()
  WHERE id = manager_id;
  
  RAISE NOTICE 'Created new store % and assigned to manager %', new_store_id, manager_id;
END $$;
*/

-- ============================================
-- OPTION 2: ASSIGN EXISTING STORE TO MANAGER
-- ============================================
-- Use this if there's already a store that should belong to the manager
-- First, check which stores are available (run the diagnostic script)

-- Example: Assign a specific store to the manager
-- Replace 'STORE_ID_HERE' with the actual store ID from the diagnostic results

/*
DO $$
DECLARE
  manager_id UUID;
  target_store_id UUID := 'STORE_ID_HERE'; -- Replace with actual store ID
BEGIN
  -- Get manager's user ID
  SELECT id INTO manager_id FROM users WHERE email = 'mg811@gmail.com';
  
  IF manager_id IS NULL THEN
    RAISE EXCEPTION 'Manager mg811@gmail.com not found in users table';
  END IF;
  
  -- Check if store exists
  IF NOT EXISTS (SELECT 1 FROM stores WHERE id = target_store_id) THEN
    RAISE EXCEPTION 'Store % not found', target_store_id;
  END IF;
  
  -- Update the manager's store_id
  UPDATE users 
  SET store_id = target_store_id,
      updated_at = NOW()
  WHERE id = manager_id;
  
  -- Also update the store's user_id if it's not set
  UPDATE stores 
  SET user_id = manager_id,
      updated_at = NOW()
  WHERE id = target_store_id AND user_id IS NULL;
  
  RAISE NOTICE 'Assigned store % to manager %', target_store_id, manager_id;
END $$;
*/

-- ============================================
-- OPTION 3: QUICK FIX - ASSIGN FIRST AVAILABLE STORE
-- ============================================
-- This automatically assigns the first available store to the manager
-- Use this if you're not sure which store to assign

DO $$
DECLARE
  manager_id UUID;
  available_store_id UUID;
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
  
  -- Find an available store (not assigned to any user, or assign to manager)
  SELECT id INTO available_store_id
  FROM stores
  WHERE user_id IS NULL
  ORDER BY created_at
  LIMIT 1;
  
  IF available_store_id IS NULL THEN
    -- No available store, create a new one
    INSERT INTO stores (name, email, user_id, status)
    VALUES (
      'Magasin Manager - mg811@gmail.com',
      'mg811@gmail.com',
      manager_id,
      'active'
    )
    RETURNING id INTO available_store_id;
    
    RAISE NOTICE 'Created new store % for manager', available_store_id;
  ELSE
    RAISE NOTICE 'Found available store %', available_store_id;
  END IF;
  
  -- Update the manager's store_id
  UPDATE users 
  SET store_id = available_store_id,
      updated_at = NOW()
  WHERE id = manager_id;
  
  -- Also update the store's user_id
  UPDATE stores 
  SET user_id = manager_id,
      updated_at = NOW()
  WHERE id = available_store_id;
  
  RAISE NOTICE 'Assigned store % to manager %', available_store_id, manager_id;
END $$;

-- ============================================
-- VERIFY THE FIX
-- ============================================
-- Run this to confirm the manager now has a store assigned

SELECT 
  '=== VERIFICATION ===' as section,
  u.email,
  u.role,
  u.store_id,
  s.name as store_name,
  s.id as store_id_verified
FROM users u
LEFT JOIN stores s ON u.store_id = s.id
WHERE u.email = 'mg811@gmail.com';

-- ============================================
-- CHECK STORE_STOCKS FOR THE ASSIGNED STORE
-- ============================================
SELECT 
  '=== STORE STOCKS FOR MANAGER ===' as section,
  COUNT(DISTINCT ss.product_id) as product_count,
  SUM(ss.quantity) as total_quantity
FROM store_stocks ss
WHERE ss.store_id = (SELECT store_id FROM users WHERE email = 'mg811@gmail.com');

-- ============================================
-- CHECK PRODUCTS VISIBLE TO MANAGER
-- ============================================
-- This simulates what the super-handler will return
SELECT 
  '=== PRODUCTS VISIBLE TO MANAGER ===' as section,
  COUNT(DISTINCT p.id) as visible_products
FROM products p
INNER JOIN store_stocks ss ON p.id = ss.product_id
WHERE ss.store_id = (SELECT store_id FROM users WHERE email = 'mg811@gmail.com');
