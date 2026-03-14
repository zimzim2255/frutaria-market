-- Add support for multiple payment methods in sales (Bon de Livraison)
-- This migration adds a new column to store multiple payment methods as JSONB

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS additional_payments JSONB DEFAULT '{}';

-- Add comment to explain the structure
COMMENT ON COLUMN sales.additional_payments IS 'Stores additional payment methods as JSON: {"cash": 100, "check": 50, "bank_transfer": 25}';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_additional_payments ON sales USING GIN (additional_payments);

-- Update existing sales to have empty additional_payments if they don't have it
UPDATE sales SET additional_payments = '{}' WHERE additional_payments IS NULL;
