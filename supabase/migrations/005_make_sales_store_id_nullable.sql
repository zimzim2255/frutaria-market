-- Make store_id nullable in sales table to support direct purchases
ALTER TABLE sales 
ALTER COLUMN store_id DROP NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN sales.store_id IS 'Store ID - nullable for direct purchases without a specific store';
