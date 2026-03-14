-- Add items column to sales table to store items as JSON
ALTER TABLE sales ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]'::jsonb;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sales_items ON sales USING GIN (items);
