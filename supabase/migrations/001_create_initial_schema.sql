-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PRODUCTS TABLE (Stock Management)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  reference VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(100),
  quantity_available INTEGER NOT NULL DEFAULT 0,
  number_of_boxes INTEGER,
  total_net_weight DECIMAL(10, 2),
  avg_net_weight_per_box DECIMAL(10, 2),
  purchase_price DECIMAL(10, 2) NOT NULL,
  sale_price DECIMAL(10, 2) NOT NULL,
  supplier_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- STORES TABLE (Clients/Boutiques)
-- ============================================
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  contact_person VARCHAR(255),
  balance DECIMAL(12, 2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ============================================
-- SUPPLIERS TABLE (Fournisseurs)
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  contact_person VARCHAR(255),
  balance DECIMAL(12, 2) DEFAULT 0,
  payment_terms VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add foreign key for products.supplier_id
ALTER TABLE products ADD CONSTRAINT fk_products_supplier 
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ============================================
-- ORDERS TABLE (Commandes)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  total_amount DECIMAL(12, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, delivered, cancelled
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partial, paid
  payment_method VARCHAR(50), -- cash, cheque, transfer, etc.
  notes TEXT,
  delivery_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- ORDER ITEMS TABLE (Items in each order)
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PAYMENTS TABLE (Paiements)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- cash, cheque, transfer, etc.
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reference_number VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- DELIVERY TABLE (Livraisons)
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  delivered_by VARCHAR(255),
  received_by VARCHAR(255),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_transit, delivered, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- CHECKS TABLE (Chèques)
-- ============================================
CREATE TABLE IF NOT EXISTS checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_number VARCHAR(50) UNIQUE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  issuer_name VARCHAR(255),
  bank_name VARCHAR(255),
  due_date DATE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, deposited, cleared, bounced, cancelled
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- TRANSFERS TABLE (Transferts de stock)
-- ============================================
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number VARCHAR(50) UNIQUE NOT NULL,
  from_location VARCHAR(255),
  to_location VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_transit, received, cancelled
  transfer_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  received_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- TRANSFER ITEMS TABLE (Items in each transfer)
-- ============================================
CREATE TABLE IF NOT EXISTS transfer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id UUID NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SALES TABLE (Ventes - for tracking sales)
-- ============================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_number VARCHAR(50) UNIQUE NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  total_amount DECIMAL(12, 2) NOT NULL,
  payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, partial, paid
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- SALE ITEMS TABLE (Items in each sale)
-- ============================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USERS TABLE (Utilisateurs - Admin users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user', -- admin, manager, user
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- STOCK HISTORY TABLE (Historique du stock)
-- ============================================
CREATE TABLE IF NOT EXISTS stock_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_change INTEGER NOT NULL,
  previous_quantity INTEGER,
  new_quantity INTEGER,
  reason VARCHAR(100), -- order_placed, order_delivered, transfer, adjustment, etc.
  reference_id UUID, -- order_id, transfer_id, etc.
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INVOICES TABLE (Factures)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  total_amount DECIMAL(12, 2) NOT NULL,
  tax_amount DECIMAL(12, 2) DEFAULT 0,
  invoice_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'draft', -- draft, sent, paid, overdue, cancelled
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_supplier_id ON products(supplier_id);
CREATE INDEX idx_stores_email ON stores(email);
CREATE INDEX idx_stores_status ON stores(status);
CREATE INDEX idx_suppliers_status ON suppliers(status);
CREATE INDEX idx_orders_store_id ON orders(store_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_store_id ON payments(store_id);
CREATE INDEX idx_payments_supplier_id ON payments(supplier_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_deliveries_order_id ON deliveries(order_id);
CREATE INDEX idx_deliveries_status ON deliveries(status);
CREATE INDEX idx_checks_status ON checks(status);
CREATE INDEX idx_checks_due_date ON checks(due_date);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_transfer_items_transfer_id ON transfer_items(transfer_id);
CREATE INDEX idx_sales_store_id ON sales(store_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_stock_history_product_id ON stock_history(product_id);
CREATE INDEX idx_stock_history_created_at ON stock_history(created_at);
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
CREATE INDEX idx_invoices_store_id ON invoices(store_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - PRODUCTS
-- ============================================
CREATE POLICY "Products are viewable by authenticated users" ON products
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Products can be created by admin" ON products
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Products can be updated by admin" ON products
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Products can be deleted by admin" ON products
  FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES - STORES
-- ============================================
CREATE POLICY "Stores are viewable by authenticated users" ON stores
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Stores can be created by admin" ON stores
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Stores can be updated by admin" ON stores
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES - ORDERS
-- ============================================
CREATE POLICY "Orders are viewable by authenticated users" ON orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Orders can be created by authenticated users" ON orders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Orders can be updated by authenticated users" ON orders
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================
-- RLS POLICIES - PAYMENTS
-- ============================================
CREATE POLICY "Payments are viewable by authenticated users" ON payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Payments can be created by authenticated users" ON payments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- FUNCTIONS FOR AUTOMATIC CALCULATIONS
-- ============================================

-- Function to calculate average net weight per box
CREATE OR REPLACE FUNCTION calculate_avg_weight()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.number_of_boxes > 0 AND NEW.total_net_weight IS NOT NULL THEN
    NEW.avg_net_weight_per_box := NEW.total_net_weight / NEW.number_of_boxes;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic average weight calculation
CREATE TRIGGER trigger_calculate_avg_weight
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION calculate_avg_weight();

-- Function to update order total amount
CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE orders
  SET total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM order_items
    WHERE order_id = NEW.order_id
  )
  WHERE id = NEW.order_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic order total calculation
CREATE TRIGGER trigger_calculate_order_total
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION calculate_order_total();

-- Function to update sale total amount
CREATE OR REPLACE FUNCTION calculate_sale_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE sales
  SET total_amount = (
    SELECT COALESCE(SUM(total_price), 0)
    FROM sale_items
    WHERE sale_id = NEW.sale_id
  )
  WHERE id = NEW.sale_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic sale total calculation
CREATE TRIGGER trigger_calculate_sale_total
AFTER INSERT OR UPDATE OR DELETE ON sale_items
FOR EACH ROW
EXECUTE FUNCTION calculate_sale_total();

-- Function to record stock history when order is delivered
CREATE OR REPLACE FUNCTION record_stock_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    INSERT INTO stock_history (product_id, quantity_change, reason, reference_id, created_by)
    SELECT 
      oi.product_id,
      -oi.quantity,
      'order_delivered',
      NEW.id,
      NEW.created_by
    FROM order_items oi
    WHERE oi.order_id = NEW.id;
    
    -- Update product quantities
    UPDATE products
    SET quantity_available = quantity_available - (
      SELECT COALESCE(SUM(quantity), 0)
      FROM order_items
      WHERE order_id = NEW.id
    )
    WHERE id IN (
      SELECT product_id FROM order_items WHERE order_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for stock history recording
CREATE TRIGGER trigger_record_stock_history
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION record_stock_history();

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- View for pending orders
CREATE OR REPLACE VIEW pending_orders AS
SELECT 
  o.id,
  o.order_number,
  s.name as store_name,
  o.total_amount,
  o.status,
  o.payment_status,
  o.created_at
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE o.status = 'pending'
ORDER BY o.created_at DESC;

-- View for stock summary
CREATE OR REPLACE VIEW stock_summary AS
SELECT 
  p.id,
  p.name,
  p.reference,
  p.category,
  p.quantity_available,
  p.sale_price,
  p.avg_net_weight_per_box,
  sup.name as supplier_name
FROM products p
LEFT JOIN suppliers sup ON p.supplier_id = sup.id
ORDER BY p.name;

-- View for store balances
CREATE OR REPLACE VIEW store_balances AS
SELECT 
  s.id,
  s.name,
  s.email,
  s.balance,
  COUNT(DISTINCT o.id) as total_orders,
  COALESCE(SUM(o.total_amount), 0) as total_spent
FROM stores s
LEFT JOIN orders o ON s.id = o.store_id
GROUP BY s.id, s.name, s.email, s.balance
ORDER BY s.name;

-- View for supplier balances
CREATE OR REPLACE VIEW supplier_balances AS
SELECT 
  sup.id,
  sup.name,
  sup.email,
  sup.balance,
  COUNT(DISTINCT p.id) as total_products
FROM suppliers sup
LEFT JOIN products p ON sup.id = p.supplier_id
GROUP BY sup.id, sup.name, sup.email, sup.balance
ORDER BY sup.name;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE products IS 'Factory stock and product information';
COMMENT ON TABLE stores IS 'Store/Client accounts';
COMMENT ON TABLE suppliers IS 'Supplier information';
COMMENT ON TABLE orders IS 'Orders placed by stores';
COMMENT ON TABLE order_items IS 'Individual items in orders';
COMMENT ON TABLE payments IS 'Payment records';
COMMENT ON TABLE deliveries IS 'Delivery tracking';
COMMENT ON TABLE checks IS 'Check payment records';
COMMENT ON TABLE transfers IS 'Stock transfers between locations';
COMMENT ON TABLE sales IS 'Sales transactions';
COMMENT ON TABLE invoices IS 'Invoice records';
COMMENT ON TABLE stock_history IS 'Stock movement history';
