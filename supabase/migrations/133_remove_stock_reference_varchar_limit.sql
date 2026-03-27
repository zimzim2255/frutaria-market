-- Remove VARCHAR(20) constraint from stock_reference fields
-- This allows stock references to be longer than 20 characters

-- Change stock_reference in products table from VARCHAR(20) to TEXT
ALTER TABLE products 
ALTER COLUMN stock_reference TYPE TEXT;

-- Change stock_reference in stock_reference_details table from VARCHAR(20) to TEXT
ALTER TABLE stock_reference_details 
ALTER COLUMN stock_reference TYPE TEXT;

-- Add comment explaining the change
COMMENT ON COLUMN products.stock_reference IS 'Stock reference identifier (no length limit)';
COMMENT ON COLUMN stock_reference_details.stock_reference IS 'Stock reference identifier (no length limit)';
