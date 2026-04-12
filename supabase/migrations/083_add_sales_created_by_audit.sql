-- Add audit fields to sales so we can track when an admin created a BL on behalf of a magasin.

-- 1) Add columns (safe/if-not-exists style via exception blocks)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'created_by_role'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN created_by_role text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'created_for_store_id'
  ) THEN
    ALTER TABLE public.sales ADD COLUMN created_for_store_id uuid;
  END IF;
END $$;

-- 2) Add FK for created_for_store_id -> stores(id) if missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales' AND column_name = 'created_for_store_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_created_for_store_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_created_for_store_id_fkey
      FOREIGN KEY (created_for_store_id)
      REFERENCES public.stores(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Index to speed up filtering/reporting
CREATE INDEX IF NOT EXISTS idx_sales_created_for_store_id ON public.sales(created_for_store_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_by_role ON public.sales(created_by_role);
