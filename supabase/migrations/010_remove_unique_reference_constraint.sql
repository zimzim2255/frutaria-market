-- Remove the UNIQUE constraint on reference to allow multiple stores to have the same product reference
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_reference_key;

-- Verify the constraint is removed
-- The reference field can now have duplicate values across different stores
