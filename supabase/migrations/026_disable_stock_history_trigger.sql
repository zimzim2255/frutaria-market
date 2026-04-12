-- Disable the trigger that was updating products.quantity_available
-- We now use store_stocks table for all stock management
DROP TRIGGER IF EXISTS trigger_record_stock_history ON orders;

-- Also drop the function since it's no longer needed
DROP FUNCTION IF EXISTS record_stock_history();

-- The stock is now managed entirely through:
-- 1. store_stocks table (per-store inventory)
-- 2. Backend logic in super-handler that updates store_stocks on payment/delivery
-- 3. products.quantity_available is now read-only (calculated from store_stocks)
