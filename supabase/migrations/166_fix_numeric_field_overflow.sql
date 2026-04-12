-- Fix numeric field overflow issues
-- ============================================
-- Increase precision of balance and amount fields to prevent overflow

-- Suppliers balance
ALTER TABLE suppliers
ALTER COLUMN balance TYPE DECIMAL(15, 2);

-- Stores balance
ALTER TABLE stores
ALTER COLUMN balance TYPE DECIMAL(15, 2);

-- Clients balance
ALTER TABLE clients
ALTER COLUMN balance TYPE DECIMAL(15, 2);

-- Check inventory amounts
ALTER TABLE check_inventory
ALTER COLUMN amount_value TYPE DECIMAL(15, 2),
ALTER COLUMN remaining_balance TYPE DECIMAL(15, 2),
ALTER COLUMN original_amount TYPE DECIMAL(15, 2);

-- Orders amounts
ALTER TABLE orders
ALTER COLUMN total_amount TYPE DECIMAL(15, 2),
ALTER COLUMN amount_paid TYPE DECIMAL(15, 2),
ALTER COLUMN remaining_balance TYPE DECIMAL(15, 2),
ALTER COLUMN pending_discount TYPE DECIMAL(15, 2);

-- Sales amounts
ALTER TABLE sales
ALTER COLUMN total_amount TYPE DECIMAL(15, 2),
ALTER COLUMN amount_paid TYPE DECIMAL(15, 2),
ALTER COLUMN remaining_balance TYPE DECIMAL(15, 2),
ALTER COLUMN pending_discount TYPE DECIMAL(15, 2);

-- Invoices amounts
ALTER TABLE invoices
ALTER COLUMN total_amount TYPE DECIMAL(15, 2),
ALTER COLUMN amount_paid TYPE DECIMAL(15, 2),
ALTER COLUMN remaining_balance TYPE DECIMAL(15, 2),
ALTER COLUMN pending_discount TYPE DECIMAL(15, 2);

-- Payments amounts
ALTER TABLE payments
ALTER COLUMN amount TYPE DECIMAL(15, 2);

-- Partial payments amounts
ALTER TABLE partial_payments
ALTER COLUMN amount_paid TYPE DECIMAL(15, 2),
ALTER COLUMN remaining_balance TYPE DECIMAL(15, 2),
ALTER COLUMN pending_discount TYPE DECIMAL(15, 2);

-- Discounts amounts
ALTER TABLE discounts
ALTER COLUMN discount_amount TYPE DECIMAL(15, 2);

-- Cash payments amounts
ALTER TABLE cash_payments
ALTER COLUMN amount TYPE DECIMAL(15, 2);

-- Expenses amounts
ALTER TABLE expenses
ALTER COLUMN amount TYPE DECIMAL(15, 2);

-- Order items and sale items prices
ALTER TABLE order_items
ALTER COLUMN unit_price TYPE DECIMAL(15, 2),
ALTER COLUMN total_price TYPE DECIMAL(15, 2);

ALTER TABLE sale_items
ALTER COLUMN unit_price TYPE DECIMAL(15, 2),
ALTER COLUMN total_price TYPE DECIMAL(15, 2);

-- Products prices
ALTER TABLE products
ALTER COLUMN purchase_price TYPE DECIMAL(15, 2),
ALTER COLUMN sale_price TYPE DECIMAL(15, 2),
ALTER COLUMN total_net_weight TYPE DECIMAL(15, 2),
ALTER COLUMN avg_net_weight_per_box TYPE DECIMAL(15, 2);
