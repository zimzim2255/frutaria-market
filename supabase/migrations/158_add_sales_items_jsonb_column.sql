-- Some deployments rely on sales.items (JSONB) to store sale items.
-- Fixes: PGRST204 Could not find the 'items' column of 'sales' in the schema cache

BEGIN;

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS items jsonb;

COMMENT ON COLUMN public.sales.items
  IS 'Sale line items stored as JSONB (legacy/compat).';

COMMIT;
