-- 116_create_admin_suppliers_support.sql
-- Purpose:
-- Treat "Fournisseur Admin" as a real supplier row so it can be selected in "Ajouter un produit"
-- and participate in normal supplier balance logic.
--
-- Strategy:
-- 1) Extend suppliers with optional link to an admin user (users.id)
-- 2) Ensure at most one supplier row per admin user
--
-- Notes:
-- - We do NOT change existing supplier behaviors.
-- - We keep it optional, so existing rows remain valid.

BEGIN;

ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS admin_user_id uuid NULL;

-- One supplier per admin user (if set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'suppliers_admin_user_id_uniq'
  ) THEN
    CREATE UNIQUE INDEX suppliers_admin_user_id_uniq
      ON public.suppliers (admin_user_id)
      WHERE admin_user_id IS NOT NULL;
  END IF;
END $$;

-- Keep FK optional (do not break if users table differs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'suppliers'
      AND constraint_name = 'suppliers_admin_user_id_fkey'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_admin_user_id_fkey
      FOREIGN KEY (admin_user_id)
      REFERENCES public.users (id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
