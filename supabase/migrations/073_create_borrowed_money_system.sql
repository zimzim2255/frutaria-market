-- Create borrowed_money table for tracking loans given to people
CREATE TABLE IF NOT EXISTS borrowed_money (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrower_name VARCHAR(255) NOT NULL,
  borrower_phone VARCHAR(20),
  borrower_email VARCHAR(255),
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'MAD',
  loan_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  due_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'active', -- active, partially_paid, fully_paid, overdue, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create borrowed_money_payments table for tracking repayments
CREATE TABLE IF NOT EXISTS borrowed_money_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrowed_money_id UUID NOT NULL REFERENCES borrowed_money(id) ON DELETE CASCADE,
  payment_amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- cash, check, bank_transfer
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reference_number VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create borrowed_money_checks table for tracking checks received as payment
CREATE TABLE IF NOT EXISTS borrowed_money_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  borrowed_money_payment_id UUID NOT NULL REFERENCES borrowed_money_payments(id) ON DELETE CASCADE,
  check_number VARCHAR(50) NOT NULL,
  check_amount DECIMAL(15, 2) NOT NULL,
  check_date TIMESTAMP WITH TIME ZONE,
  check_due_date TIMESTAMP WITH TIME ZONE,
  bank_name VARCHAR(255),
  check_status VARCHAR(50) DEFAULT 'received', -- received, deposited, cleared, bounced, cancelled
  inventory_name VARCHAR(255), -- Special name like "Check from Ali Montaasion"
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_borrowed_money_admin_id ON borrowed_money(admin_id);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_status ON borrowed_money(status);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_loan_date ON borrowed_money(loan_date);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_payments_borrowed_money_id ON borrowed_money_payments(borrowed_money_id);
CREATE INDEX IF NOT EXISTS idx_borrowed_money_checks_payment_id ON borrowed_money_checks(borrowed_money_payment_id);

-- Enable RLS (Row Level Security)
ALTER TABLE borrowed_money ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowed_money_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowed_money_checks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for borrowed_money
CREATE POLICY "Users can view borrowed money from their store" ON borrowed_money
  FOR SELECT USING (
    admin_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert borrowed money" ON borrowed_money
  FOR INSERT WITH CHECK (
    admin_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update borrowed money" ON borrowed_money
  FOR UPDATE USING (
    admin_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete borrowed money" ON borrowed_money
  FOR DELETE USING (
    admin_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create RLS policies for borrowed_money_payments
CREATE POLICY "Users can view borrowed money payments" ON borrowed_money_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM borrowed_money bm 
      WHERE bm.id = borrowed_money_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Admins can insert borrowed money payments" ON borrowed_money_payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM borrowed_money bm 
      WHERE bm.id = borrowed_money_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Admins can update borrowed money payments" ON borrowed_money_payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM borrowed_money bm 
      WHERE bm.id = borrowed_money_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

-- Create RLS policies for borrowed_money_checks
CREATE POLICY "Users can view borrowed money checks" ON borrowed_money_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM borrowed_money_payments bmp
      JOIN borrowed_money bm ON bm.id = bmp.borrowed_money_id
      WHERE bmp.id = borrowed_money_payment_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Admins can insert borrowed money checks" ON borrowed_money_checks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM borrowed_money_payments bmp
      JOIN borrowed_money bm ON bm.id = bmp.borrowed_money_id
      WHERE bmp.id = borrowed_money_payment_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Admins can update borrowed money checks" ON borrowed_money_checks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM borrowed_money_payments bmp
      JOIN borrowed_money bm ON bm.id = bmp.borrowed_money_id
      WHERE bmp.id = borrowed_money_payment_id AND (
        bm.admin_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
        )
      )
    )
  );
