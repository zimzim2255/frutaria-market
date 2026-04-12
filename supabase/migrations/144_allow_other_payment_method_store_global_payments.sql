-- Allow payment_method='other' for store_global_payments
-- This is required for the new "Autre" payment method in "Paiement Global Magasin".

begin;

-- Drop old constraint (if exists)
alter table public.store_global_payments
  drop constraint if exists store_global_payments_payment_method_check;

-- Recreate constraint including 'other'
alter table public.store_global_payments
  add constraint store_global_payments_payment_method_check
  check (payment_method in ('cash', 'check', 'bank_transfer', 'other'));

commit;
