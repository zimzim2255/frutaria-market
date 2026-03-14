-- Add missing columns to sale_items table
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS reference VARCHAR(100);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS lot VARCHAR(100);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS caisse INTEGER DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS moyenne DECIMAL(10, 2);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS fourchette_min DECIMAL(10, 2);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS fourchette_max DECIMAL(10, 2);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2);

-- Create index for reference column for faster lookups
CREATE INDEX IF NOT EXISTS idx_sale_items_reference ON sale_items(reference);
CREATE INDEX IF NOT EXISTS idx_sale_items_category ON sale_items(category);
