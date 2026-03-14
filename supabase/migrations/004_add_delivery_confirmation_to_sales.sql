-- Add delivery confirmation fields to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_by VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON COLUMN sales.received_by IS 'Name of the person who received the package';
COMMENT ON COLUMN sales.received_date IS 'Date and time when the package was confirmed as received';
COMMENT ON COLUMN sales.delivery_confirmed_by IS 'User ID of the person who confirmed the delivery';
