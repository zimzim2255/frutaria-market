-- Add payment_notes column to sales table
ALTER TABLE sales ADD COLUMN payment_notes TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN sales.payment_notes IS 'Payment notes for tracking check details, payment method info, etc.';
