-- Add custom operation_date column to product_additions_history
-- This allows users to set a custom date when adding products instead of using created_at
-- The date is optional (nullable) - when null, the UI should fall back to created_at

alter table public.product_additions_history
  add column if not exists operation_date date null;

-- Add index for filtering by operation_date
create index if not exists product_additions_history_operation_date_idx
  on public.product_additions_history (operation_date desc);

-- Backfill: for existing rows, set operation_date to the date part of created_at
update public.product_additions_history
set operation_date = created_at::date
where operation_date is null;