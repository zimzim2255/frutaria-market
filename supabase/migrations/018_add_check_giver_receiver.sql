-- ============================================
-- ADD GIVER AND RECEIVER TRACKING TO CHECKS
-- ============================================

-- Add giver_id and receiver_id columns to track check flow
ALTER TABLE check_inventory 
ADD COLUMN IF NOT EXISTS giver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS usage_percentage DECIMAL(5, 2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN check_inventory.giver_id IS 'User ID of the person who gave/sent the check';
COMMENT ON COLUMN check_inventory.receiver_id IS 'User ID of the person who received the check';
COMMENT ON COLUMN check_inventory.usage_percentage IS 'Percentage of check used (0-100)';
