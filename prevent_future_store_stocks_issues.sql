-- ============================================================
-- PREVENTION: Ensure new products always have store_stocks entries
-- ============================================================

-- OPTION 1: Create a TRIGGER to auto-create store_stocks
-- This runs EVERY time a product is inserted
-- ============================================================

CREATE OR REPLACE FUNCTION create_store_stocks_on_product_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- After a product is created, automatically create its store_stocks entry
  INSERT INTO store_stocks (product_id, store_id, quantity, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.store_id,
    NEW.quantity_available,
    NOW(),
    NOW()
  )
  ON CONFLICT (product_id, store_id) DO UPDATE
  SET quantity = NEW.quantity_available,
      updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
CREATE TRIGGER product_insert_create_store_stocks
AFTER INSERT ON products
FOR EACH ROW
EXECUTE FUNCTION create_store_stocks_on_product_insert();

-- ============================================================
-- OPTION 2: Add a CONSTRAINT to prevent orphaned products
-- ============================================================
-- This ensures every product MUST have a corresponding store_stocks entry
-- (Uncomment if you want to use - but might break existing code initially)

-- ALTER TABLE products
-- ADD CONSTRAINT products_must_have_store_stocks
-- CHECK (
--   id IN (SELECT DISTINCT product_id FROM store_stocks)
-- );

-- ============================================================
-- OPTION 3: Verify trigger works
-- ============================================================

-- Test: Create a new product (should auto-create store_stocks)
-- INSERT INTO products (reference, name, quantity_available, store_id, created_by)
-- VALUES ('TEST-001', 'Test Product', 100, 'store-uuid', 'test@email.com');

-- Check if store_stocks was auto-created:
-- SELECT * FROM store_stocks 
-- WHERE product_id = (SELECT id FROM products WHERE reference = 'TEST-001');

-- ============================================================
-- SUMMARY
-- ============================================================
-- What this does:
-- 1. Automatically creates store_stocks entry when product is inserted
-- 2. Updates store_stocks if product is inserted with same store_id
-- 3. No more orphaned products without store_stocks
-- 4. Future products will be safe
-- ============================================================
