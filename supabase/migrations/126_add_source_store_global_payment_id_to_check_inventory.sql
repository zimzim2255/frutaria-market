-- Link check_inventory rows to store_global_payments deterministically
-- This avoids relying on parsing notes markers.

ALTER TABLE IF EXISTS public.check_inventory
ADD COLUMN IF NOT EXISTS source_store_global_payment_id uuid;

CREATE INDEX IF NOT EXISTS idx_check_inventory_source_store_global_payment_id
ON public.check_inventory (source_store_global_payment_id);
