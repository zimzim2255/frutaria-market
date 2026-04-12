-- Adds admin_id to check_safe (some deployments rely on it for transfer-to-coffer flows)

BEGIN;

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS admin_id uuid;

-- Best-effort FK to users table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'check_safe_admin_id_fkey'
    ) THEN
      ALTER TABLE public.check_safe
        ADD CONSTRAINT check_safe_admin_id_fkey
        FOREIGN KEY (admin_id)
        REFERENCES public.users(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_check_safe_admin_id
  ON public.check_safe(admin_id);

COMMENT ON COLUMN public.check_safe.admin_id
  IS 'Admin user responsible for this check (nullable).';

COMMIT;
