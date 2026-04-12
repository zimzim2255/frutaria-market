-- Add check_date (date d'émission) to check_inventory
-- We keep it as DATE because UI uses yyyy-mm-dd from <input type="date">.
-- Idempotent.

ALTER TABLE public.check_inventory
ADD COLUMN IF NOT EXISTS check_date date;
