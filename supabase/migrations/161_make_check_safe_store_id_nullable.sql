-- Make store_id nullable in check_safe table
-- Fixes: null value in column "store_id" of relation "check_safe" violates not-null constraint
-- The store_id can be null when the check is not associated with a specific store
-- (e.g., admin-managed checks or checks from Clients Magasins without a store assignment)

ALTER TABLE public.check_safe
  ALTER COLUMN store_id DROP NOT NULL;

-- Update the column comment to reflect it's nullable
COMMENT ON COLUMN public.check_safe.store_id
  IS 'Reference to store (nullable - can be assigned to admin instead)';
