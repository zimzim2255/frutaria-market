-- Add giver_name to check_safe so we can display "Donneur" in Coffre-fort table
-- and preserve who gave the check when transferring from check_inventory.

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS giver_name text;

COMMENT ON COLUMN public.check_safe.giver_name IS 'Name/email of the giver (donneur) copied from check_inventory.given_to when transferring into the safe';

CREATE INDEX IF NOT EXISTS idx_check_safe_giver_name ON public.check_safe (giver_name);
