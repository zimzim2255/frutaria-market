-- Create expenses table for Le Charge (withdrawals from cash)
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  reason TEXT NOT NULL,
  proof_file TEXT, -- base64 encoded file
  proof_file_type VARCHAR(10), -- 'image' or 'pdf'
  proof_file_name VARCHAR(255),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_expenses_store_id ON expenses(store_id);
CREATE INDEX idx_expenses_created_at ON expenses(created_at);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view expenses from their store, admins see all
CREATE POLICY "expenses_select_policy" ON expenses
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
    OR
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- RLS Policy: Users can insert expenses for their store, admins for any store
CREATE POLICY "expenses_insert_policy" ON expenses
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
    OR
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- RLS Policy: Users can delete their own expenses, admins can delete any
CREATE POLICY "expenses_delete_policy" ON expenses
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role = 'admin'
    )
    OR
    created_by = auth.uid()
  );
