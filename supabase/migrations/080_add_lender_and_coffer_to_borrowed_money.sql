-- Add lender_name and coffer_id fields to borrowed_money table
ALTER TABLE borrowed_money
ADD COLUMN IF NOT EXISTS lender_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS coffer_id VARCHAR(255) DEFAULT 'main';

-- Create index for coffer_id for better query performance
CREATE INDEX IF NOT EXISTS idx_borrowed_money_coffer_id ON borrowed_money(coffer_id);
