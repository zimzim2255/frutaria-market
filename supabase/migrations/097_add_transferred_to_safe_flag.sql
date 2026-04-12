-- Add a flag to track if a check has been transferred to the safe
-- This prevents the same check from being transferred multiple times

ALTER TABLE check_inventory
ADD COLUMN IF NOT EXISTS transferred_to_safe BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS transferred_to_safe_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transferred_to_safe_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create an index for quick lookup of transferred checks
CREATE INDEX IF NOT EXISTS idx_check_inventory_transferred_to_safe ON check_inventory(transferred_to_safe);

-- Add a comment for documentation
COMMENT ON COLUMN check_inventory.transferred_to_safe IS 'Flag to prevent duplicate transfers to the safe/coffer';
COMMENT ON COLUMN check_inventory.transferred_to_safe_at IS 'Timestamp when the check was transferred to the safe';
COMMENT ON COLUMN check_inventory.transferred_to_safe_by IS 'User who transferred the check to the safe';
