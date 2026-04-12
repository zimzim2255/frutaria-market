-- Add column to track if payment was made using checks
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_by_checks BOOLEAN DEFAULT FALSE;

-- Add column to track which checks were used for payment
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS check_ids_used TEXT; -- JSON array of check IDs

-- Add column to track the number of checks used
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS checks_count INTEGER DEFAULT 0;

-- Add column to track total amount paid via checks
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS amount_paid_by_checks NUMERIC(12, 2) DEFAULT 0;

-- Create index for faster queries on paid_by_checks
CREATE INDEX IF NOT EXISTS idx_invoices_paid_by_checks ON invoices(paid_by_checks);
