-- ============================================
-- CHECK SAFE TABLE (Coffre-fort pour chèques)
-- ============================================
-- This table represents the "safe" where confirmed checks are stored
-- Once checks are confirmed and placed in the safe, the payment is automatically transferred

CREATE TABLE IF NOT EXISTS check_safe (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_id UUID NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  
  -- Check details (denormalized for quick access)
  check_number VARCHAR(50) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  
  -- Safe status workflow
  status VARCHAR(50) DEFAULT 'pending', -- pending, verified, confirmed, in_safe, transferred
  
  -- Verification details
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  
  -- Confirmation details
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmation_notes TEXT,
  
  -- Safe placement details
  placed_in_safe_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  placed_in_safe_at TIMESTAMP WITH TIME ZONE,
  
  -- Payment transfer details
  payment_transferred BOOLEAN DEFAULT FALSE,
  payment_transferred_at TIMESTAMP WITH TIME ZONE,
  payment_transferred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for check_safe
CREATE INDEX IF NOT EXISTS idx_check_safe_check_id ON check_safe(check_id);
CREATE INDEX IF NOT EXISTS idx_check_safe_store_id ON check_safe(store_id);
CREATE INDEX IF NOT EXISTS idx_check_safe_sale_id ON check_safe(sale_id);
CREATE INDEX IF NOT EXISTS idx_check_safe_status ON check_safe(status);
CREATE INDEX IF NOT EXISTS idx_check_safe_verified_at ON check_safe(verified_at);
CREATE INDEX IF NOT EXISTS idx_check_safe_confirmed_at ON check_safe(confirmed_at);
CREATE INDEX IF NOT EXISTS idx_check_safe_placed_in_safe_at ON check_safe(placed_in_safe_at);
CREATE INDEX IF NOT EXISTS idx_check_safe_payment_transferred ON check_safe(payment_transferred);
CREATE INDEX IF NOT EXISTS idx_check_safe_created_at ON check_safe(created_at);

-- Enable RLS on check_safe
ALTER TABLE check_safe ENABLE ROW LEVEL SECURITY;

-- RLS Policies for check_safe
DROP POLICY IF EXISTS "Check safe is viewable by authenticated users" ON check_safe;
CREATE POLICY "Check safe is viewable by authenticated users" ON check_safe
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check safe can be created by authenticated users" ON check_safe;
CREATE POLICY "Check safe can be created by authenticated users" ON check_safe
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check safe can be updated by authenticated users" ON check_safe;
CREATE POLICY "Check safe can be updated by authenticated users" ON check_safe
  FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Check safe can be deleted by authenticated users" ON check_safe;
CREATE POLICY "Check safe can be deleted by authenticated users" ON check_safe
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- VIEW FOR CHECK SAFE SUMMARY
-- ============================================
CREATE OR REPLACE VIEW check_safe_summary AS
SELECT 
  cs.id,
  cs.check_id,
  cs.check_number,
  cs.amount,
  cs.status,
  cs.store_id,
  s.name as store_name,
  cs.sale_id,
  sa.sale_number,
  sa.total_amount as sale_total_amount,
  cs.verified_at,
  u_verified.email as verified_by_email,
  cs.confirmed_at,
  u_confirmed.email as confirmed_by_email,
  cs.placed_in_safe_at,
  u_placed.email as placed_in_safe_by_email,
  cs.payment_transferred,
  cs.payment_transferred_at,
  u_transferred.email as payment_transferred_by_email,
  cs.created_at,
  cs.updated_at
FROM check_safe cs
LEFT JOIN stores s ON cs.store_id = s.id
LEFT JOIN sales sa ON cs.sale_id = sa.id
LEFT JOIN users u_verified ON cs.verified_by = u_verified.id
LEFT JOIN users u_confirmed ON cs.confirmed_by = u_confirmed.id
LEFT JOIN users u_placed ON cs.placed_in_safe_by = u_placed.id
LEFT JOIN users u_transferred ON cs.payment_transferred_by = u_transferred.id
ORDER BY cs.created_at DESC;

-- ============================================
-- VIEW FOR CHECK SAFE STATISTICS
-- ============================================
CREATE OR REPLACE VIEW check_safe_stats AS
SELECT 
  COUNT(*) as total_checks_in_safe,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_checks,
  COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified_checks,
  COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_checks,
  COUNT(CASE WHEN status = 'in_safe' THEN 1 END) as in_safe_checks,
  COUNT(CASE WHEN status = 'transferred' THEN 1 END) as transferred_checks,
  COUNT(CASE WHEN payment_transferred = TRUE THEN 1 END) as payments_transferred,
  COALESCE(SUM(amount), 0) as total_amount,
  COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
  COALESCE(SUM(CASE WHEN status = 'verified' THEN amount ELSE 0 END), 0) as verified_amount,
  COALESCE(SUM(CASE WHEN status = 'confirmed' THEN amount ELSE 0 END), 0) as confirmed_amount,
  COALESCE(SUM(CASE WHEN status = 'in_safe' THEN amount ELSE 0 END), 0) as in_safe_amount,
  COALESCE(SUM(CASE WHEN status = 'transferred' THEN amount ELSE 0 END), 0) as transferred_amount,
  COALESCE(SUM(CASE WHEN payment_transferred = TRUE THEN amount ELSE 0 END), 0) as transferred_payment_amount
FROM check_safe;

-- ============================================
-- FUNCTION TO AUTOMATICALLY TRANSFER PAYMENT WHEN CHECK IS CONFIRMED
-- ============================================
CREATE OR REPLACE FUNCTION transfer_payment_on_check_confirmation()
RETURNS TRIGGER AS $$
BEGIN
  -- When a check is placed in safe and payment hasn't been transferred yet
  IF NEW.status = 'in_safe' AND NEW.payment_transferred = FALSE THEN
    -- Update the sale payment status to 'paid' if it exists
    IF NEW.sale_id IS NOT NULL THEN
      UPDATE sales
      SET payment_status = 'paid',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = NEW.sale_id;
    END IF;
    
    -- Mark payment as transferred
    NEW.payment_transferred = TRUE;
    NEW.payment_transferred_at = CURRENT_TIMESTAMP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic payment transfer
CREATE TRIGGER trigger_transfer_payment_on_check_confirmation
BEFORE UPDATE ON check_safe
FOR EACH ROW
EXECUTE FUNCTION transfer_payment_on_check_confirmation();

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE check_safe IS 'Safe storage for confirmed checks with payment transfer tracking';
COMMENT ON COLUMN check_safe.status IS 'Workflow status: pending (initial), verified (checked by admin), confirmed (approved), in_safe (stored), transferred (payment processed)';
COMMENT ON COLUMN check_safe.verified_by IS 'User who verified the check';
COMMENT ON COLUMN check_safe.confirmed_by IS 'User who confirmed the check';
COMMENT ON COLUMN check_safe.placed_in_safe_by IS 'User who placed the check in the safe';
COMMENT ON COLUMN check_safe.payment_transferred IS 'Whether the payment has been automatically transferred to the store';
COMMENT ON COLUMN check_safe.payment_transferred_by IS 'User who initiated the payment transfer';
