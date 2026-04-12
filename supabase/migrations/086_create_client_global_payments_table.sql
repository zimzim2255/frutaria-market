-- 087_create_client_global_payments_table.sql
-- Purpose: Keep an auditable, organized record of "global payments" done on a client,
-- independent from invoices / BL / sales.

-- Create table
CREATE TABLE IF NOT EXISTS client_global_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client reference (preferred)
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Store that recorded/paid the global payment (optional, but useful for reporting)
  paid_by_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  paid_by_store_name TEXT,

  -- Payment details
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'check', 'bank_transfer')),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_global_payments_client_id ON client_global_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_global_payments_paid_by_store_id ON client_global_payments(paid_by_store_id);
CREATE INDEX IF NOT EXISTS idx_client_global_payments_payment_date ON client_global_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_client_global_payments_created_at ON client_global_payments(created_at);

-- RLS
ALTER TABLE client_global_payments ENABLE ROW LEVEL SECURITY;

-- SELECT: users can view payments for their own store; admins can view all
CREATE POLICY "Users can view client global payments from their store"
  ON client_global_payments FOR SELECT
  USING (
    paid_by_store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- INSERT: users can insert payments for their own store; admins can insert for any
CREATE POLICY "Users can insert client global payments for their store"
  ON client_global_payments FOR INSERT
  WITH CHECK (
    paid_by_store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- UPDATE: creator or admin (keeps it consistent with cash_payments style)
CREATE POLICY "Users can update their client global payments"
  ON client_global_payments FOR UPDATE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- DELETE: creator or admin
CREATE POLICY "Users can delete their client global payments"
  ON client_global_payments FOR DELETE
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON client_global_payments TO authenticated;
