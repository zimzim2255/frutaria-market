-- Link check_safe_usages rows to supplier_advances so we can show
-- the exact amount of each check used for a given supplier.
--
-- This is additive and safe to run multiple times.

alter table public.check_safe_usages
add column if not exists supplier_advance_id uuid;

-- Optional FK (best-effort): if supplier_advances exists, link it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'supplier_advances'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_safe_usages_supplier_advance_id_fkey'
        AND conrelid = 'public.check_safe_usages'::regclass
    ) THEN
      ALTER TABLE public.check_safe_usages
      ADD CONSTRAINT check_safe_usages_supplier_advance_id_fkey
      FOREIGN KEY (supplier_advance_id)
      REFERENCES public.supplier_advances(id)
      ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

create index if not exists check_safe_usages_supplier_advance_id_idx
on public.check_safe_usages (supplier_advance_id);
