-- Force schema cache refresh - schema update timestamp
-- This migration forces Supabase to refresh its internal schema cache
-- by making a minor change to the invoices table

-- Add a comment to the invoices table to trigger schema cache refresh
COMMENT ON TABLE invoices IS 'Invoices table - schema cache refresh';

-- Verify all required columns exist
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT 'Unknown';

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_email TEXT NOT NULL DEFAULT 'unknown@example.com';

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_phone TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_address TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS client_ice TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check'));

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(10, 2) DEFAULT 0;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'cancelled'));

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS check_id UUID REFERENCES check_inventory(id) ON DELETE SET NULL;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]';

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method ON invoices(payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_check_id ON invoices(check_id);
