-- ============================================
-- CREATE STOCK REFERENCE DETAILS TABLE
-- ============================================
-- This table stores detailed information about each stock reference
-- including supplier, fees, dates, and warehouse information

CREATE TABLE IF NOT EXISTS stock_reference_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_reference VARCHAR(20) NOT NULL UNIQUE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  palette_category VARCHAR(255),
  frais_maritime DECIMAL(12, 2) DEFAULT 0,
  frais_transit DECIMAL(12, 2) DEFAULT 0,
  onssa DECIMAL(12, 2) DEFAULT 0,
  frais_divers DECIMAL(12, 2) DEFAULT 0,
  frais_transport DECIMAL(12, 2) DEFAULT 0,
  date_dechargement DATE,
  entrepot VARCHAR(255),
  matricule VARCHAR(255),
  date_chargement DATE,
  magasinage DECIMAL(12, 2) DEFAULT 0,
  taxe DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_stock_reference_details_stock_reference ON stock_reference_details(stock_reference);
CREATE INDEX IF NOT EXISTS idx_stock_reference_details_supplier_id ON stock_reference_details(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_reference_details_entrepot ON stock_reference_details(entrepot);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE stock_reference_details ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================
CREATE POLICY "Stock reference details are viewable by authenticated users" ON stock_reference_details
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Stock reference details can be created by admin" ON stock_reference_details
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Stock reference details can be updated by admin" ON stock_reference_details
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Stock reference details can be deleted by admin" ON stock_reference_details
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE stock_reference_details IS 'Detailed information for each stock reference including fees and warehouse data';
COMMENT ON COLUMN stock_reference_details.stock_reference IS 'Stock reference identifier';
COMMENT ON COLUMN stock_reference_details.frais_maritime IS 'Maritime shipping fees in MAD';
COMMENT ON COLUMN stock_reference_details.frais_transit IS 'Transit fees in MAD';
COMMENT ON COLUMN stock_reference_details.onssa IS 'ONSSA fees in MAD';
COMMENT ON COLUMN stock_reference_details.frais_divers IS 'Miscellaneous fees in MAD';
COMMENT ON COLUMN stock_reference_details.frais_transport IS 'Transport fees in MAD';
COMMENT ON COLUMN stock_reference_details.date_dechargement IS 'Unloading date';
COMMENT ON COLUMN stock_reference_details.entrepot IS 'Warehouse/Storage location';
COMMENT ON COLUMN stock_reference_details.matricule IS 'Registration/Matricule number';
COMMENT ON COLUMN stock_reference_details.date_chargement IS 'Loading date';
COMMENT ON COLUMN stock_reference_details.magasinage IS 'Storage fees in MAD';
COMMENT ON COLUMN stock_reference_details.taxe IS 'Tax amount in MAD';
