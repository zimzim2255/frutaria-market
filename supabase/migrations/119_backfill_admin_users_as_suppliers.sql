-- 117_backfill_admin_users_as_suppliers.sql
-- Purpose:
-- Automatically create a "supplier" row for every admin user so that
-- "Fournisseur Admin" can be selected in "➕ Ajouter un produit" like a normal supplier.
--
-- Rules:
-- - Only users with role='admin'
-- - Must have users.store_id (we attach supplier to that store)
-- - Create supplier only if it doesn't already exist for that admin_user_id
-- - Name defaults to users.email (or users.id if email is null)

BEGIN;

INSERT INTO public.suppliers (
  store_id,
  name,
  email,
  phone,
  address,
  city,
  postal_code,
  contact_person,
  payment_terms,
  is_passage,
  balance,
  status,
  created_by,
  admin_user_id
)
SELECT
  u.store_id,
  COALESCE(NULLIF(u.email, ''), u.id::text) AS name,
  u.email,
  NULL::text AS phone,
  NULL::text AS address,
  NULL::text AS city,
  NULL::text AS postal_code,
  NULL::text AS contact_person,
  NULL::text AS payment_terms,
  FALSE AS is_passage,
  0::numeric AS balance,
  'active' AS status,
  u.id AS created_by,
  u.id AS admin_user_id
FROM public.users u
WHERE lower(COALESCE(u.role, '')) = 'admin'
  AND u.store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.suppliers s
    WHERE s.admin_user_id = u.id
  );

COMMIT;
