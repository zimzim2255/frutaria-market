-- 033_add_bank_transfer_fields_to_invoices.sql
-- Ensure invoices table has fields required for bank transfer and partial payments

DO $$
BEGIN
  -- payment_method
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE invoices ADD COLUMN payment_method text NOT NULL DEFAULT 'cash';
  END IF;

  -- bank_transfer_proof_url
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'bank_transfer_proof_url'
  ) THEN
    ALTER TABLE invoices ADD COLUMN bank_transfer_proof_url text;
  END IF;

  -- amount_paid
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE invoices ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0;
  END IF;

  -- remaining_balance
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'remaining_balance'
  ) THEN
    ALTER TABLE invoices ADD COLUMN remaining_balance numeric NOT NULL DEFAULT 0;
  END IF;

  -- pending_discount
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'pending_discount'
  ) THEN
    ALTER TABLE invoices ADD COLUMN pending_discount numeric NOT NULL DEFAULT 0;
  END IF;

  -- status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'status'
  ) THEN
    ALTER TABLE invoices ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;

  -- client_phone
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'client_phone'
  ) THEN
    ALTER TABLE invoices ADD COLUMN client_phone text;
  END IF;

  -- client_address
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'client_address'
  ) THEN
    ALTER TABLE invoices ADD COLUMN client_address text;
  END IF;

  -- client_ice
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'client_ice'
  ) THEN
    ALTER TABLE invoices ADD COLUMN client_ice text;
  END IF;

  -- items (jsonb)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'invoices' AND column_name = 'items'
  ) THEN
    ALTER TABLE invoices ADD COLUMN items jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
