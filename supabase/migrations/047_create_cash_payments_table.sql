-- Create cash_payments table
CREATE TABLE IF NOT EXISTS cash_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  amount DECIMAL(15, 2) NOT NULL,
  reason TEXT NOT NULL,
  proof_file TEXT, -- Base64 encoded file
  proof_file_type VARCHAR(50), -- 'image' or 'pdf'
  proof_file_name VARCHAR(255),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_cash_payments_store_id ON cash_payments(store_id);
CREATE INDEX idx_cash_payments_created_at ON cash_payments(created_at);
CREATE INDEX idx_cash_payments_created_by ON cash_payments(created_by);

-- Enable RLS
ALTER TABLE cash_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view cash payments from their own store
CREATE POLICY "Users can view cash payments from their store"
  ON cash_payments FOR SELECT
  USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
    OR
    -- Admins can view all
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Users can insert cash payments for their store
CREATE POLICY "Users can insert cash payments for their store"
  ON cash_payments FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
    OR
    -- Admins can insert for any store
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Users can delete their own cash payments
CREATE POLICY "Users can delete their own cash payments"
  ON cash_payments FOR DELETE
  USING (
    created_by = auth.uid()
    OR
    -- Admins can delete any
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON cash_payments TO authenticated;
