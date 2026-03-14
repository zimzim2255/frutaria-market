-- Create charge_categories table for Le Charge utilities
CREATE TABLE IF NOT EXISTS charge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7),
  status VARCHAR(20) DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE charge_categories ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read active categories
CREATE POLICY "Anyone can read active charge categories"
  ON charge_categories
  FOR SELECT
  USING (status = 'active');

-- Policy: Only admins can insert
CREATE POLICY "Only admins can insert charge categories"
  ON charge_categories
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Policy: Only admins can update
CREATE POLICY "Only admins can update charge categories"
  ON charge_categories
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Policy: Only admins can delete
CREATE POLICY "Only admins can delete charge categories"
  ON charge_categories
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'admin'
    )
  );

-- Create index for faster queries
CREATE INDEX idx_charge_categories_status ON charge_categories(status);
CREATE INDEX idx_charge_categories_created_by ON charge_categories(created_by);
