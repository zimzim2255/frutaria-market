-- Migration: allow deleting products without deleting sales history
--
-- Goal:
-- - When a product is deleted, keep sale_items rows intact.
-- - Only set sale_items.product_id to NULL.
--
-- This is required because the current FK blocks deletes (RESTRICT/NO ACTION).

BEGIN;

-- Ensure column is nullable (required for ON DELETE SET NULL)
ALTER TABLE public.sale_items
  ALTER COLUMN product_id DROP NOT NULL;

-- Drop existing FK constraint (name can vary across environments; try common names)
ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS fk_sale_items_product;

-- Recreate FK with ON DELETE SET NULL
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

COMMIT;
