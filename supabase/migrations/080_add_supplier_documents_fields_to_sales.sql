-- Add missing fields to sales table so purchases/transfers can be treated as supplier documents
-- This supports Supplier Details -> Historique des Achats / Factures / Bons / Livraisons

-- Supplier linked to the document
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Source store/vendor of goods (for inter-store transfers and purchases)
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS source_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- Generic document type label (BonCommande / BonLivraison / Facture / purchase / transfer ...)
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS document_type TEXT;

-- Multi payment methods array (BonCommande-like). Stored as JSONB.
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS payment_methods JSONB DEFAULT '[]'::jsonb;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_sales_supplier_id ON sales(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sales_source_store_id ON sales(source_store_id);
CREATE INDEX IF NOT EXISTS idx_sales_document_type ON sales(document_type);
