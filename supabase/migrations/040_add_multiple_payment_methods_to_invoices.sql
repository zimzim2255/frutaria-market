-- Add support for multiple payment methods in invoices
-- This migration adds a new column to store multiple payment methods as JSONB

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS additional_payments JSONB DEFAULT '{}';

-- Add comment to explain the structure
COMMENT ON COLUMN invoices.additional_payments IS 'Stores additional payment methods as JSON: {"cash": 100, "check": 50, "bank_transfer": 25}';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_additional_payments ON invoices USING GIN (additional_payments);

-- Update existing invoices to have empty additional_payments if they don't have it
UPDATE invoices SET additional_payments = '{}' WHERE additional_payments IS NULL;
