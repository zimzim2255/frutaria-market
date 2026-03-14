-- ============================================
-- ADD STORE SCOPE TO PRODUCT TEMPLATES
-- ============================================
-- Problem:
--   The API now filters GET /product-templates by product_templates.store_id for non-admin users,
--   but the column did not exist in the database, causing 500 errors.
--
-- Approach:
--   1) Add product_templates.store_id (UUID, nullable)
--   2) Backfill store_id for templates created by a user that has users.store_id
--   3) Add an index for performance
--   4) Add a FK to stores(id) (nullable; ON DELETE SET NULL)
--
-- Notes:
--   - Templates created by admins (or any user without a store_id) will remain global (store_id NULL)
--   - The edge function will restrict non-admin users to their store_id.

ALTER TABLE product_templates
  ADD COLUMN IF NOT EXISTS store_id UUID;

-- Backfill store_id from the creator's store, when available.
-- Assumes you have a public.users table with a store_id column.
UPDATE product_templates pt
SET store_id = u.store_id
FROM public.users u
WHERE pt.store_id IS NULL
  AND pt.created_by IS NOT NULL
  AND u.id = pt.created_by
  AND u.store_id IS NOT NULL;

-- Performance index for store scoping.
CREATE INDEX IF NOT EXISTS idx_product_templates_store_id ON product_templates(store_id);

-- FK (safe to run if stores table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'stores'
  ) THEN
    ALTER TABLE product_templates
      ADD CONSTRAINT product_templates_store_id_fkey
      FOREIGN KEY (store_id)
      REFERENCES public.stores(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- constraint already exists
    NULL;
END $$;
