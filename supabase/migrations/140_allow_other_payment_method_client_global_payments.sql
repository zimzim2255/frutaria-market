-- Allow payment_method='other' for client_global_payments
-- This is required for the new "Autre" payment method in "Paiement Global Client".

begin;

-- Drop old constraint (if exists)
alter table public.client_global_payments
  drop constraint if exists client_global_payments_payment_method_check;

-- Recreate constraint including 'other'
alter table public.client_global_payments
  add constraint client_global_payments_payment_method_check
  check (payment_method in ('cash', 'check', 'bank_transfer', 'other'));

commit;
