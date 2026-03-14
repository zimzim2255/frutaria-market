-- Add client information fields to sales table
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_name VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_phone VARCHAR(20);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_address TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ice VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_if_number VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_rc VARCHAR(50);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_patente VARCHAR(50);

-- Add additional fields for delivery and payment tracking
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(50) DEFAULT 'none';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(50) DEFAULT 'preparing';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_by VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_confirmed_by VARCHAR(255);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_notes TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Create index for client_name for faster searches
CREATE INDEX IF NOT EXISTS idx_sales_client_name ON sales(client_name);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status ON sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_delivery_status ON sales(delivery_status);
