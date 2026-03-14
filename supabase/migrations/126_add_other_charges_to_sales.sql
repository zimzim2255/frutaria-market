-- Add other_charges to sales (used by Achat/Transfert additional charges)
-- This value is included in total_amount calculation on the frontend and displayed in details.

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS other_charges DECIMAL(15, 2) DEFAULT 0;

-- Basic check: prevent negative charges
ALTER TABLE public.sales
DROP CONSTRAINT IF EXISTS sales_other_charges_non_negative;

ALTER TABLE public.sales
ADD CONSTRAINT sales_other_charges_non_negative CHECK (other_charges >= 0);
