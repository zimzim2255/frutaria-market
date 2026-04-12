-- Link check_safe rows to their originating check_inventory row
-- This helps prevent mixing payment references with cheque numbers and allows safe joins.

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS check_inventory_id uuid;

ALTER TABLE public.check_safe
ADD CONSTRAINT IF NOT EXISTS check_safe_check_inventory_id_fkey
FOREIGN KEY (check_inventory_id)
REFERENCES public.check_inventory(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_check_safe_check_inventory_id
ON public.check_safe(check_inventory_id);
