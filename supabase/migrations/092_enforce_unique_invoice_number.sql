-- Enforce uniqueness of invoice_number at the database level.
-- If a duplicate happens (race condition, bug, manual insert), insertion will fail.

DO $$
BEGIN
  -- Ensure invoices.invoice_number is unique
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_invoice_number_key'
  ) THEN
    -- If the table already has a UNIQUE constraint created under a different name,
    -- this will error; the DO block guard above aims to prevent duplicates.
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);
  END IF;

  -- Helpful index (also enforces uniqueness if created as UNIQUE INDEX)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_invoices_invoice_number_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_invoices_invoice_number_unique
      ON public.invoices (invoice_number);
  END IF;
END $$;
