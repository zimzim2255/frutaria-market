-- Add store_id column to suppliers table to associate suppliers with stores
ALTER TABLE suppliers ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

-- Create index on store_id for faster queries
CREATE INDEX idx_suppliers_store_id ON suppliers(store_id);
