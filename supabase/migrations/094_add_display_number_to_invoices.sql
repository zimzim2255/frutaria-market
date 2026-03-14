-- Add display_number column to invoices so PostgREST can accept custom invoice references
-- This migration is idempotent.

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS display_number varchar(100);

-- Optional but recommended: refresh PostgREST schema cache immediately.
-- (Supabase exposes this helper in many projects; if it doesn't exist in your instance,
-- the ALTER TABLE above is still correct and you can reload schema cache from dashboard.)
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
