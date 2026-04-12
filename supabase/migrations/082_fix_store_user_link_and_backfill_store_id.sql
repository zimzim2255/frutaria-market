-- 083_fix_store_user_link_and_backfill_store_id.sql
-- Fix magasin/user association:
-- 1) Ensure stores.user_id exists and references users(id)
-- 2) Backfill users.store_id from stores.user_id
-- 3) Backfill stores.user_id from users.store_id when possible
-- 4) Add helpful indexes

BEGIN;

-- 1) Ensure stores.user_id exists
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Ensure foreign key (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'stores_user_id_fkey'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Backfill users.store_id from stores.user_id
-- If a store references a user_id, that user should have store_id = store.id
UPDATE public.users u
SET store_id = s.id
FROM public.stores s
WHERE s.user_id = u.id
  AND (u.store_id IS NULL OR u.store_id <> s.id);

-- 3) Backfill stores.user_id from users.store_id (reverse direction)
-- If a user has store_id and the store has no user_id, set it.
-- If multiple users share the same store_id, pick the earliest created one.
WITH ranked AS (
  SELECT
    u.id AS user_id,
    u.store_id,
    ROW_NUMBER() OVER (PARTITION BY u.store_id ORDER BY u.created_at NULLS LAST, u.id) AS rn
  FROM public.users u
  WHERE u.store_id IS NOT NULL
)
UPDATE public.stores s
SET user_id = r.user_id
FROM ranked r
WHERE s.id = r.store_id
  AND s.user_id IS NULL
  AND r.rn = 1;

-- 4) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON public.stores(user_id);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON public.users(store_id);

COMMIT;
