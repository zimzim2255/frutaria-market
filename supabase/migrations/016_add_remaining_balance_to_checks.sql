-- ============================================
-- ADD REMAINING BALANCE TO CHECK INVENTORY
-- ============================================

-- Add remaining_balance column to track partially used checks
ALTER TABLE check_inventory 
ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_amount DECIMAL(12, 2) DEFAULT NULL;

-- Update existing records to set original_amount = amount_value and remaining_balance = amount_value
UPDATE check_inventory 
SET original_amount = amount_value, remaining_balance = amount_value 
WHERE original_amount IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN check_inventory.remaining_balance IS 'Remaining balance on the check after partial usage (NULL means fully used or not used yet)';
COMMENT ON COLUMN check_inventory.original_amount IS 'Original amount value of the check before any usage';
