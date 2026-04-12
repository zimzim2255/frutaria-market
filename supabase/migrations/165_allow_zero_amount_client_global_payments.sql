-- Allow amount = 0 in client_global_payments (for remise-only records)
-- Drop existing check constraint
ALTER TABLE client_global_payments
  DROP CONSTRAINT IF EXISTS client_global_payments_amount_check;

-- Add new constraint that allows 0
ALTER TABLE client_global_payments
  ADD CONSTRAINT client_global_payments_amount_check CHECK (amount >= 0);