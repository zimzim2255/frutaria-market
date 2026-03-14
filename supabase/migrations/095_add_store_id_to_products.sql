-- Add store_id to products to associate each product record with a magasin
-- Required for admin "act as magasin" stock entry.
-- This migration is idempotent.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS store_id uuid;

-- Optional FK (kept without cascade to avoid accidental deletions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_store_id_fkey'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_store_id_fkey
    FOREIGN KEY (store_id)
    REFERENCES public.stores(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);

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
