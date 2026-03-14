-- Add column to track which store made the payment (for admin global payments or store user payments)
-- This supports both:
-- 1. Admin users selecting an entrepot to act as
-- 2. Store users making payments from their own store
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS paid_by_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Add column to track the store name for reference
-- Stored for quick access without joining to stores table
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS paid_by_store_name TEXT;

-- Add column to track payment notes (e.g., "Global payment by admin - Entrepôt: X" or "Global payment by store: Y")
-- Helps identify who made the payment and from which store
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS payment_notes_admin TEXT;

-- Add column to track the last payment date
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE;

-- Create index for faster queries on paid_by_store_id
-- Useful for filtering payments by store
CREATE INDEX IF NOT EXISTS idx_suppliers_paid_by_store_id ON suppliers(paid_by_store_id);
