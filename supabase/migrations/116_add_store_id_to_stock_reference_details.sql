-- ============================================
-- ADD store_id TO stock_reference_details
-- ============================================
-- This column is required to scope stock reference details per store (magasin)
-- and to match the edge function expectations.

ALTER TABLE stock_reference_details
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Useful for filtering by store
CREATE INDEX IF NOT EXISTS idx_stock_reference_details_store_id
  ON stock_reference_details(store_id);

COMMENT ON COLUMN stock_reference_details.store_id IS 'Store (magasin) owning this stock reference details row';
