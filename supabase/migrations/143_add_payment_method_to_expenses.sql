-- Add payment_method to expenses so Caisse can attribute expenses (e.g. supplier_passage) to cash/check/bank transfer.
-- Safe additive migration.

alter table public.expenses
  add column if not exists payment_method text null;

-- Optional: basic sanity check (do not enforce constraint to keep backward compatibility)
-- Valid values used in the app: 'cash', 'check', 'bank_transfer'
