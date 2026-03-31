-- Add execution_date and invoice_date columns to sales table
-- These fields are used for Bon de Commande to store custom dates

ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS execution_date DATE,
ADD COLUMN IF NOT EXISTS invoice_date DATE;

-- Add comment to explain the purpose of these columns
COMMENT ON COLUMN sales.execution_date IS 'Custom execution date set in Bon de Commande (Date d''Exécution)';
COMMENT ON COLUMN sales.invoice_date IS 'Custom invoice date set in Bon de Commande (Date de Facture)';
