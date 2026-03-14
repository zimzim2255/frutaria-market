-- Add name column to sale_items table to store product name
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS name VARCHAR(255);
