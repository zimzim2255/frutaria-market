-- Ensure store_stocks has a unique (product_id, store_id) pair so UPSERT works.
-- This migration is idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_stocks_product_id_store_id_key'
  ) THEN
    ALTER TABLE public.store_stocks
    ADD CONSTRAINT store_stocks_product_id_store_id_key
    UNIQUE (product_id, store_id);
  END IF;
END $$;

-- Optional but recommended: refresh PostgREST schema cache immediately.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'notify_pgrst'
  ) THEN
    PERFORM public.notify_pgrst('reload schema');
  END IF;
END $$;
