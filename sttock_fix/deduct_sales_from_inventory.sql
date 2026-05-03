-- Deduct sold quantities (caisse) from products and store_stocks
-- This subtracts the quantity sold (caisse) from sale_items 
-- for each product in each store to update inventory

-- Step 1: Update products.quantity_available by subtracting caisse sold
UPDATE products p
SET quantity_available = GREATEST(0, COALESCE(p.quantity_available, 0) - COALESCE(sold.total_caisse_sold, 0))
FROM (
  SELECT 
    product_id,
    SUM(CAST(caisse AS FLOAT)) as total_caisse_sold
   FROM sale_items
  WHERE caisse IS NOT NULL
  GROUP BY product_id
) sold
WHERE p.id = sold.product_id;

-- Step 2: Update store_stocks.quantity by subtracting caisse sold
UPDATE store_stocks ss
SET quantity = GREATEST(0, COALESCE(ss.quantity, 0) - COALESCE(sold.total_caisse_sold, 0))
FROM (
  SELECT 
    si.product_id,
    s.store_id,
    SUM(CAST(si.caisse AS FLOAT)) as total_caisse_sold
   FROM sale_items si
  JOIN sales s ON si.sale_id = s.id
  WHERE si.caisse IS NOT NULL
  GROUP BY si.product_id, s.store_id
) sold
WHERE ss.product_id = sold.product_id 
  AND ss.store_id = sold.store_id;

-- Verification: Show inventory after deductions
SELECT 
  p.id as product_id,
  p.store_id,
  p.name,
  p.stock_reference,
  p.quantity_available as current_quantity_available,
  ss.quantity as current_store_stocks_qty,
  COALESCE(SUM(CAST(si.caisse AS FLOAT)), 0) as total_caisse_sold
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id AND p.store_id = ss.store_id
 LEFT JOIN sale_items si ON p.id = si.product_id
LEFT JOIN sales s ON si.sale_id = s.id AND s.store_id = p.store_id
GROUP BY p.id, p.store_id, p.name, p.stock_reference, p.quantity_available, ss.quantity
ORDER BY p.store_id, p.name;
