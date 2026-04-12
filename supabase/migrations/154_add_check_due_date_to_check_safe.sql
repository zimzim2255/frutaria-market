-- Adds check_due_date to check_safe (some UI flows expect it)

BEGIN;

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS check_due_date date;

COMMENT ON COLUMN public.check_safe.check_due_date
  IS 'Due date / échéance of the check (nullable).';

CREATE INDEX IF NOT EXISTS idx_check_safe_check_due_date
  ON public.check_safe(check_due_date);

COMMIT;
