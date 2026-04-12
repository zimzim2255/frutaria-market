-- Adds check_inventory_id to check_safe so it can be linked to check_inventory-based operations
-- Required because some deployments run the check_safe system without this column.

BEGIN;

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS check_inventory_id uuid;

-- FK (best-effort; will fail if check_inventory table doesn't exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'check_inventory'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_safe_check_inventory_id_fkey'
    ) THEN
      ALTER TABLE public.check_safe
        ADD CONSTRAINT check_safe_check_inventory_id_fkey
        FOREIGN KEY (check_inventory_id)
        REFERENCES public.check_inventory(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_check_safe_check_inventory_id
  ON public.check_safe(check_inventory_id);

-- Column comments
COMMENT ON COLUMN public.check_safe.check_id
  IS 'Reference to checks table (nullable - can be linked to check_inventory instead)';

COMMENT ON COLUMN public.check_safe.store_id
  IS 'Reference to store (nullable - can be assigned to admin instead)';

COMMENT ON COLUMN public.check_safe.check_inventory_id
  IS 'Reference to check_inventory table for inventory-based checks';

COMMIT;
