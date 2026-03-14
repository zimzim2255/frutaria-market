-- Add store (magasin) remise support for global payments
-- We reuse the existing discounts table and link a remise to a specific store_global_payments row
-- using (ref_table, ref_id).
-- This enables Caisse to display the remise separately from the payment amount.

-- Ensure ref fields exist (older deployments may not have them)
ALTER TABLE IF EXISTS public.discounts
  ADD COLUMN IF NOT EXISTS ref_table TEXT NULL;

ALTER TABLE IF EXISTS public.discounts
  ADD COLUMN IF NOT EXISTS ref_id UUID NULL;

-- Helpful index for linking remise to a payment row
CREATE INDEX IF NOT EXISTS idx_discounts_ref_table_ref_id
  ON public.discounts (ref_table, ref_id);

-- Optional: keep docs up to date
COMMENT ON COLUMN public.discounts.ref_table IS 'Table name of referenced entity (sales | invoices | client_global_payments | store_global_payments | etc.)';
COMMENT ON COLUMN public.discounts.ref_id IS 'UUID of referenced entity row to attach this discount to a specific movement.';
