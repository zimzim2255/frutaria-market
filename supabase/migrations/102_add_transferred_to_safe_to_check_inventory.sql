-- Add transferred_to_safe flag to check_inventory
-- Used to mark checks that were already transferred into check_safe (coffre).
-- Idempotent.

ALTER TABLE public.check_inventory
ADD COLUMN IF NOT EXISTS transferred_to_safe boolean NOT NULL DEFAULT false;

-- Helpful index for filtering non-transferred checks
CREATE INDEX IF NOT EXISTS idx_check_inventory_transferred_to_safe
  ON public.check_inventory (transferred_to_safe);
