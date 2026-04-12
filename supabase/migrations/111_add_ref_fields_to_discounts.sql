-- 113_add_ref_fields_to_discounts.sql
-- Purpose: Allow linking remises/discounts to a specific movement (sale/invoice/global payment).
-- This enables correct per-row display in Caisse (e.g., "23 + (343) remise").

ALTER TABLE IF EXISTS public.discounts
  ADD COLUMN IF NOT EXISTS ref_table TEXT NULL;

ALTER TABLE IF EXISTS public.discounts
  ADD COLUMN IF NOT EXISTS ref_id UUID NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_discounts_ref_table_ref_id ON public.discounts (ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_discounts_ref_id ON public.discounts (ref_id);

COMMENT ON COLUMN public.discounts.ref_table IS 'Table name of referenced entity (sales | invoices | client_global_payments | supplier_advances | etc.)';
COMMENT ON COLUMN public.discounts.ref_id IS 'UUID of referenced entity row to attach this discount to a specific movement.';
