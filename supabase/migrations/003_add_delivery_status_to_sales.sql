-- Add delivery_status column to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'preparing';

-- Add comment for documentation
COMMENT ON COLUMN sales.delivery_status IS 'Delivery status: preparing, in_transit, delivered, canceled';
