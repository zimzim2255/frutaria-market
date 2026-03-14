-- ============================================
-- CHECK INVENTORY TABLE (NEW - Separate from checks)
-- ============================================

CREATE TABLE IF NOT EXISTS check_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_id_number VARCHAR(100) UNIQUE NOT NULL,
  amount_value DECIMAL(12, 2) NOT NULL,
  given_to VARCHAR(255) NOT NULL,
  given_to_type VARCHAR(50) NOT NULL, -- 'client', 'store', 'supplier', 'other'
  given_to_id UUID, -- Reference to stores/suppliers table
  image_url TEXT,
  pdf_url TEXT,
  file_type VARCHAR(20), -- 'image', 'pdf'
  file_size INTEGER, -- in bytes
  status VARCHAR(50) DEFAULT 'pending', -- pending, received, used, archived
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for check_inventory
CREATE INDEX IF NOT EXISTS idx_check_inventory_check_id_number ON check_inventory(check_id_number);
CREATE INDEX IF NOT EXISTS idx_check_inventory_given_to_id ON check_inventory(given_to_id);
CREATE INDEX IF NOT EXISTS idx_check_inventory_given_to_type ON check_inventory(given_to_type);
CREATE INDEX IF NOT EXISTS idx_check_inventory_status ON check_inventory(status);
CREATE INDEX IF NOT EXISTS idx_check_inventory_uploaded_by ON check_inventory(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_check_inventory_created_at ON check_inventory(created_at);

-- Enable RLS on check_inventory
ALTER TABLE check_inventory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for check_inventory
DROP POLICY IF EXISTS "Check inventory is viewable by authenticated users" ON check_inventory;
CREATE POLICY "Check inventory is viewable by authenticated users" ON check_inventory
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check inventory can be created by authenticated users" ON check_inventory;
CREATE POLICY "Check inventory can be created by authenticated users" ON check_inventory
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check inventory can be updated by authenticated users" ON check_inventory;
CREATE POLICY "Check inventory can be updated by authenticated users" ON check_inventory
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check inventory can be deleted by authenticated users" ON check_inventory;
CREATE POLICY "Check inventory can be deleted by authenticated users" ON check_inventory
  FOR DELETE USING (auth.role() = 'authenticated');

-- Create a view for check inventory summary
CREATE OR REPLACE VIEW check_inventory_summary AS
SELECT 
  ci.id,
  ci.check_id_number,
  ci.amount_value,
  ci.given_to,
  ci.given_to_type,
  ci.given_to_id,
  CASE 
    WHEN ci.given_to_type = 'client' THEN s.name
    WHEN ci.given_to_type = 'store' THEN s.name
    WHEN ci.given_to_type = 'supplier' THEN sup.name
    ELSE ci.given_to
  END as given_to_name,
  ci.image_url,
  ci.pdf_url,
  ci.file_type,
  ci.status,
  ci.created_at,
  ci.updated_at,
  u.email as uploaded_by_email
FROM check_inventory ci
LEFT JOIN stores s ON ci.given_to_id = s.id AND ci.given_to_type IN ('client', 'store')
LEFT JOIN suppliers sup ON ci.given_to_id = sup.id AND ci.given_to_type = 'supplier'
LEFT JOIN users u ON ci.uploaded_by = u.id
ORDER BY ci.created_at DESC;

-- Create a view for check inventory statistics
CREATE OR REPLACE VIEW check_inventory_stats AS
SELECT 
  COUNT(*) as total_checks,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_checks,
  COUNT(CASE WHEN status = 'received' THEN 1 END) as received_checks,
  COUNT(CASE WHEN status = 'used' THEN 1 END) as used_checks,
  COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_checks,
  COALESCE(SUM(amount_value), 0) as total_amount,
  COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_value ELSE 0 END), 0) as pending_amount,
  COALESCE(SUM(CASE WHEN status = 'received' THEN amount_value ELSE 0 END), 0) as received_amount,
  COALESCE(SUM(CASE WHEN status = 'used' THEN amount_value ELSE 0 END), 0) as used_amount
FROM check_inventory;

-- Add comment for documentation
COMMENT ON TABLE check_inventory IS 'Check inventory with image/PDF support for tracking received checks';
COMMENT ON COLUMN check_inventory.check_id_number IS 'Unique identifier for the check (e.g., check number from bank)';
COMMENT ON COLUMN check_inventory.amount_value IS 'Monetary value of the check';
COMMENT ON COLUMN check_inventory.given_to_type IS 'Type of entity that gave the check: client, store, supplier, or other';
COMMENT ON COLUMN check_inventory.image_url IS 'URL to uploaded check image (JPG, PNG)';
COMMENT ON COLUMN check_inventory.pdf_url IS 'URL to uploaded check PDF';
COMMENT ON COLUMN check_inventory.file_type IS 'Type of uploaded file: image or pdf';
COMMENT ON COLUMN check_inventory.status IS 'Status of check: pending (not yet received), received (in inventory), used (cashed), archived';
