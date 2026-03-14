-- Add payment_method column to invoices table if it doesn't exist
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check'));

-- Add other missing columns if they don't exist
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_phone TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_address TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_ice TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS check_id UUID REFERENCES check_inventory(id) ON DELETE SET NULL;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method ON invoices(payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_check_id ON invoices(check_id);
