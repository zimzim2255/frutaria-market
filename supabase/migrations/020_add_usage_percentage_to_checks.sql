-- ============================================
-- ADD USAGE PERCENTAGE TO CHECK INVENTORY
-- ============================================

-- Add usage_percentage column to track check usage
ALTER TABLE check_inventory 
ADD COLUMN IF NOT EXISTS usage_percentage DECIMAL(5, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN check_inventory.usage_percentage IS 'Percentage of check that has been used (0-100)';
