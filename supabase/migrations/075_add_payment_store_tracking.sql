-- Add column to track which store made the payment (for admin global payments or store user payments)
-- This supports both:
-- 1. Admin users selecting an entrepot to act as
-- 2. Store users making payments from their own store
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_by_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Add column to track the store name for reference
-- Stored for quick access without joining to stores table
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_by_store_name TEXT;

-- Add column to track payment notes (e.g., "Global payment by admin - Entrepôt: X" or "Global payment by store: Y")
-- Helps identify who made the payment and from which store
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_notes_admin TEXT;

-- Create index for faster queries on paid_by_store_id
-- Useful for filtering payments by store
CREATE INDEX IF NOT EXISTS idx_invoices_paid_by_store_id ON invoices(paid_by_store_id);
