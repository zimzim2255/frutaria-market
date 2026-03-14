-- Prevent duplicate Coffre rows for the same cheque inventory item
-- This guarantees idempotency of confirmation flows.

-- Create a unique index (partial to allow NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS ux_check_safe_check_inventory_id
ON public.check_safe(check_inventory_id)
WHERE check_inventory_id IS NOT NULL;
