-- Add supplier_id column to discounts table for easier filtering
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS supplier_id UUID;

-- Create index for faster queries by supplier_id
CREATE INDEX IF NOT EXISTS idx_discounts_supplier_id ON discounts(supplier_id);

-- Update existing discounts to populate supplier_id based on entity_id when entity_type is 'supplier'
UPDATE discounts 
SET supplier_id = entity_id 
WHERE entity_type = 'supplier' AND supplier_id IS NULL;
