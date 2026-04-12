-- Backfill a dedicated store_id for each admin who doesn't have one.
--
-- Goal:
-- - Every admin user gets a store row so caisse operations can be store-scoped.
-- - We create one store per admin ("Caisse Admin - <email>") and set users.store_id to that store.
--
-- Safe to run multiple times:
-- - Only affects admins where users.store_id IS NULL.
-- - Prevents duplicate store creation by checking existing stores.user_id.

BEGIN;

-- 1) Create a store for each admin missing store_id (only if they don't already own a store)
INSERT INTO public.stores (
  name,
  email,
  phone,
  address,
  city,
  postal_code,
  contact_person,
  balance,
  status,
  user_id,
  created_at,
  updated_at
)
SELECT
  ('Caisse Admin - ' || COALESCE(u.email, u.id::text)) AS name,
  u.email,
  NULL::text AS phone,
  NULL::text AS address,
  NULL::text AS city,
  NULL::text AS postal_code,
  u.email AS contact_person,
  0::numeric AS balance,
  'active'::text AS status,
  u.id AS user_id,
  NOW() AS created_at,
  NOW() AS updated_at
FROM public.users u
WHERE LOWER(COALESCE(u.role, '')) = 'admin'
  AND u.store_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.user_id = u.id
  );

-- 2) Assign those newly created stores to the admin users
UPDATE public.users u
SET
  store_id = s.id,
  updated_at = NOW()
FROM public.stores s
WHERE LOWER(COALESCE(u.role, '')) = 'admin'
  AND u.store_id IS NULL
  AND s.user_id = u.id;

COMMIT;
