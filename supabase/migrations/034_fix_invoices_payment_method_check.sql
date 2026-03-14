-- 034_fix_invoices_payment_method_check.sql
-- Ensure invoices.payment_method accepts 'bank_transfer'

-- If payment_method is an enum, add the value (best-effort; ignore if not enum)
DO $$
DECLARE
  enum_type_name text;
BEGIN
  SELECT CASE WHEN data_type = 'USER-DEFINED' THEN udt_name ELSE NULL END
    INTO enum_type_name
  FROM information_schema.columns
  WHERE table_name = 'invoices' AND column_name = 'payment_method';

  IF enum_type_name IS NOT NULL THEN
    BEGIN
      EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type_name, 'bank_transfer');
    EXCEPTION WHEN others THEN
      -- Ignore if cannot alter type (value may already exist)
      NULL;
    END;
  END IF;
END $$;

-- Drop existing check constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'invoices'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'invoices_payment_method_check'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_payment_method_check;
  END IF;
END $$;

-- Recreate check constraint to include bank_transfer
ALTER TABLE invoices
  ADD CONSTRAINT invoices_payment_method_check
  CHECK (payment_method IN ('cash', 'check', 'bank_transfer'));
