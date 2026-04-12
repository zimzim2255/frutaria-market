-- Add reference fields to global payments (client + supplier)
-- This enables a user-entered reference number to be stored and later searched/exported.

-- Client global payments
ALTER TABLE IF EXISTS public.client_global_payments
  ADD COLUMN IF NOT EXISTS reference_number text;

CREATE INDEX IF NOT EXISTS idx_client_global_payments_reference_number
  ON public.client_global_payments (reference_number);

-- Supplier payments (global supplier payment flow uses the shared `payments` table)
ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS reference_number text;

CREATE INDEX IF NOT EXISTS idx_payments_reference_number
  ON public.payments (reference_number);
