
-- Update comments to document the columns
COMMENT ON COLUMN check_safe.check_id IS 'Reference to checks table (nullable - can be linked to check_inventory instead)';
COMMENT ON COLUMN check_safe.store_id IS 'Reference to store (nullable - can be assigned to admin instead)';
COMMENT ON COLUMN check_safe.check_inventory_id IS 'Reference to check_inventory table for inventory-based checks';
