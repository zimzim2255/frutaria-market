-- Add payment_date column to expenses table to allow custom payment dates for coffer movements
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS payment_date TEXT;

-- Add payment_date column to supplier_advances table to allow custom advance dates
ALTER TABLE supplier_advances
ADD COLUMN IF NOT EXISTS payment_date TEXT;
