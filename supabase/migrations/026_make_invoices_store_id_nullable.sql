-- Make store_id nullable in invoices table
-- This allows invoices to be created without being tied to a specific store
-- (useful for general invoices/factures)

ALTER TABLE invoices
ALTER COLUMN store_id DROP NOT NULL;

-- Add default value for store_id
ALTER TABLE invoices
ALTER COLUMN store_id SET DEFAULT NULL;
