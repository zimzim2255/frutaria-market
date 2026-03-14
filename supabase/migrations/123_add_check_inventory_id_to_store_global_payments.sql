-- 123_add_check_inventory_id_to_store_global_payments.sql
-- Purpose:
-- - Persist a link between a store_global_payments row (payment reference) and the actual cheque row in check_inventory.
-- - This fixes confirmation flows where PUT confirmation must update an existing cheque instead of creating duplicates.

ALTER TABLE public.store_global_payments
  ADD COLUMN IF NOT EXISTS check_inventory_id UUID;

-- FK is optional but strongly recommended.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_global_payments_check_inventory_id_fkey'
  ) THEN
    ALTER TABLE public.store_global_payments
      ADD CONSTRAINT store_global_payments_check_inventory_id_fkey
      FOREIGN KEY (check_inventory_id)
      REFERENCES public.check_inventory(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_global_payments_check_inventory_id
  ON public.store_global_payments(check_inventory_id);

COMMENT ON COLUMN public.store_global_payments.check_inventory_id IS 'Links the global payment (payment reference) to an existing cheque in check_inventory';
