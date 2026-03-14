-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  client_address TEXT,
  client_ice TEXT,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'check')),
  total_amount DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0,
  remaining_balance DECIMAL(10, 2) NOT NULL DEFAULT 0,
  pending_discount DECIMAL(10, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'partial', 'cancelled')),
  check_id UUID REFERENCES check_inventory(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method ON invoices(payment_method);
CREATE INDEX IF NOT EXISTS idx_invoices_check_id ON invoices(check_id);

-- Enable RLS
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own invoices" ON invoices
  FOR SELECT USING (auth.uid() = created_by OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Users can create invoices" ON invoices
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own invoices" ON invoices
  FOR UPDATE USING (auth.uid() = created_by OR auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins can delete invoices" ON invoices
  FOR DELETE USING (auth.jwt() ->> 'role' = 'admin');
