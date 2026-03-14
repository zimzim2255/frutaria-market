-- ============================================
-- CLIENTS TABLE (Clients per Store)
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  ice VARCHAR(20) NOT NULL,
  if_number VARCHAR(20),
  rc VARCHAR(20),
  patente VARCHAR(20),
  balance DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR CLIENTS TABLE
-- ============================================
CREATE INDEX idx_clients_store_id ON clients(store_id);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_ice ON clients(ice);
CREATE INDEX idx_clients_created_at ON clients(created_at);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS) FOR CLIENTS
-- ============================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - CLIENTS
-- ============================================
-- Clients are viewable by authenticated users
CREATE POLICY "Clients are viewable by authenticated users" ON clients
  FOR SELECT USING (auth.role() = 'authenticated');

-- Clients can be created by authenticated users
CREATE POLICY "Clients can be created by authenticated users" ON clients
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Clients can be updated by authenticated users
CREATE POLICY "Clients can be updated by authenticated users" ON clients
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Clients can be deleted by authenticated users
CREATE POLICY "Clients can be deleted by authenticated users" ON clients
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE clients IS 'Clients/Customers for each store';
COMMENT ON COLUMN clients.store_id IS 'Reference to the store that owns this client';
COMMENT ON COLUMN clients.ice IS 'Identifiant Commun de l''Entreprise (ICE) - Moroccan business identifier';
COMMENT ON COLUMN clients.if_number IS 'Identifiant Fiscal (IF) - Tax identification number';
COMMENT ON COLUMN clients.rc IS 'Registre de Commerce (RC) - Commercial registration number';
COMMENT ON COLUMN clients.patente IS 'Patente - Business license number';
