-- ============================================
-- PARTIAL PAYMENT SYSTEM WITH CONFIRMATION
-- ============================================

-- Add new columns to orders table for partial payment tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(50) DEFAULT 'none'; -- none, pending, approved, rejected

-- Add new columns to sales table for partial payment tracking
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(50) DEFAULT 'none'; -- none, pending, approved, rejected

-- Add new columns to invoices table for partial payment tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS remaining_balance DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pending_discount DECIMAL(12, 2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmation_status VARCHAR(50) DEFAULT 'none'; -- none, pending, approved, rejected

-- Create a new table for tracking partial payments and discounts
CREATE TABLE IF NOT EXISTS partial_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount_paid DECIMAL(12, 2) NOT NULL,
  remaining_balance DECIMAL(12, 2) NOT NULL,
  pending_discount DECIMAL(12, 2) NOT NULL,
  confirmation_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  payment_method VARCHAR(50),
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for partial payments
CREATE INDEX idx_partial_payments_order_id ON partial_payments(order_id);
CREATE INDEX idx_partial_payments_sale_id ON partial_payments(sale_id);
CREATE INDEX idx_partial_payments_invoice_id ON partial_payments(invoice_id);
CREATE INDEX idx_partial_payments_confirmation_status ON partial_payments(confirmation_status);
CREATE INDEX idx_partial_payments_created_at ON partial_payments(created_at);

-- Enable RLS on partial_payments
ALTER TABLE partial_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for partial_payments
CREATE POLICY "Partial payments are viewable by authenticated users" ON partial_payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Partial payments can be created by authenticated users" ON partial_payments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Partial payments can be updated by authenticated users" ON partial_payments
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Function to update order payment status based on partial payment
CREATE OR REPLACE FUNCTION update_order_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount_paid > 0 AND NEW.amount_paid < NEW.total_amount THEN
    NEW.payment_status := 'partial';
  ELSIF NEW.amount_paid >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'unpaid';
  END IF;
  
  -- Calculate remaining balance
  NEW.remaining_balance := NEW.total_amount - NEW.amount_paid;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic order payment status update
CREATE TRIGGER trigger_update_order_payment_status
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_order_payment_status();

-- Function to update sales payment status based on partial payment
CREATE OR REPLACE FUNCTION update_sales_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount_paid > 0 AND NEW.amount_paid < NEW.total_amount THEN
    NEW.payment_status := 'partial';
  ELSIF NEW.amount_paid >= NEW.total_amount THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'unpaid';
  END IF;
  
  -- Calculate remaining balance
  NEW.remaining_balance := NEW.total_amount - NEW.amount_paid;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic sales payment status update
CREATE TRIGGER trigger_update_sales_payment_status
BEFORE INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION update_sales_payment_status();

-- Function to update invoice payment status based on partial payment
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount_paid > 0 AND NEW.amount_paid < NEW.total_amount THEN
    NEW.status := 'partial';
  ELSIF NEW.amount_paid >= NEW.total_amount THEN
    NEW.status := 'paid';
  ELSE
    NEW.status := 'draft';
  END IF;
  
  -- Calculate remaining balance
  NEW.remaining_balance := NEW.total_amount - NEW.amount_paid;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic invoice payment status update
CREATE TRIGGER trigger_update_invoice_payment_status
BEFORE INSERT OR UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION update_invoice_payment_status();

-- View for pending confirmations
CREATE OR REPLACE VIEW pending_confirmations AS
SELECT 
  pp.id,
  pp.order_id,
  pp.sale_id,
  pp.invoice_id,
  pp.amount_paid,
  pp.remaining_balance,
  pp.pending_discount,
  pp.confirmation_status,
  pp.created_at,
  COALESCE(o.order_number, s.sale_number, i.invoice_number) as reference_number,
  COALESCE(o.total_amount, s.total_amount, i.total_amount) as total_amount
FROM partial_payments pp
LEFT JOIN orders o ON pp.order_id = o.id
LEFT JOIN sales s ON pp.sale_id = s.id
LEFT JOIN invoices i ON pp.invoice_id = i.id
WHERE pp.confirmation_status = 'pending'
ORDER BY pp.created_at DESC;

-- View for confirmed discounts
CREATE OR REPLACE VIEW confirmed_discounts AS
SELECT 
  pp.id,
  pp.order_id,
  pp.sale_id,
  pp.invoice_id,
  pp.amount_paid,
  pp.remaining_balance,
  pp.pending_discount,
  pp.confirmed_by,
  pp.confirmed_at,
  COALESCE(o.order_number, s.sale_number, i.invoice_number) as reference_number,
  COALESCE(o.total_amount, s.total_amount, i.total_amount) as total_amount
FROM partial_payments pp
LEFT JOIN orders o ON pp.order_id = o.id
LEFT JOIN sales s ON pp.sale_id = s.id
LEFT JOIN invoices i ON pp.invoice_id = i.id
WHERE pp.confirmation_status = 'approved'
ORDER BY pp.confirmed_at DESC;
