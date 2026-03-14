-- Create discounts table
CREATE TABLE IF NOT EXISTS discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID,
  entity_name VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('customer', 'supplier', 'store')),
  discount_percentage DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(12, 2) DEFAULT 0,
  reason TEXT,
  applied_date TIMESTAMP DEFAULT NOW(),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_discounts_entity_type ON discounts(entity_type);
CREATE INDEX idx_discounts_entity_name ON discounts(entity_name);
CREATE INDEX idx_discounts_status ON discounts(status);
CREATE INDEX idx_discounts_created_at ON discounts(created_at);
