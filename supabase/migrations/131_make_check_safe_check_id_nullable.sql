-- Allow check_safe rows to be linked to check_inventory instead of checks
-- Fixes: null value in column "check_id" violates not-null constraint

BEGIN;

ALTER TABLE public.check_safe
  ALTER COLUMN check_id DROP NOT NULL;

-- Ensure store_id is allowed to be nullable as documented in code comments (optional)
-- Uncomment if you also need it:
-- ALTER TABLE public.check_safe
--   ALTER COLUMN store_id DROP NOT NULL;

COMMIT;
