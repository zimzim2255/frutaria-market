-- Sync caisse from product_additions_history to products and store_stocks
-- This updates quantity_available in products and quantity in store_stocks
-- for each product in each store based on the injected caisse amounts

-- Step 1: Update products.quantity_available using caisse from product_additions_history
UPDATE products p
SET quantity_available = CAST(pah.caisse AS INTEGER)
FROM (
  SELECT DISTINCT ON (product_id, store_id) 
    product_id, 
    store_id, 
    caisse
  FROM product_additions_history
  WHERE caisse IS NOT NULL
  ORDER BY product_id, store_id, created_at DESC
) pah
WHERE p.id = pah.product_id 
  AND p.store_id = pah.store_id;

-- Step 2: Update store_stocks.quantity using caisse from product_additions_history
UPDATE store_stocks ss
SET quantity = CAST(pah.caisse AS INTEGER)
FROM (
  SELECT DISTINCT ON (product_id, store_id) 
    product_id, 
    store_id, 
    caisse
  FROM product_additions_history
  WHERE caisse IS NOT NULL
  ORDER BY product_id, store_id, created_at DESC
) pah
WHERE ss.product_id = pah.product_id 
  AND ss.store_id = pah.store_id;

-- Verification: Show what was updated
SELECT 
  p.id as product_id,
  p.store_id,
  p.name,
  p.stock_reference,
  p.quantity_available as products_qty,
  ss.quantity as store_stocks_qty,
  pah.caisse as source_caisse
FROM products p
LEFT JOIN store_stocks ss ON p.id = ss.product_id AND p.store_id = ss.store_id
LEFT JOIN LATERAL (
  SELECT DISTINCT ON (product_id, store_id)
    product_id, store_id, caisse, created_at
  FROM product_additions_history
  WHERE product_id = p.id AND store_id = p.store_id
  ORDER BY product_id, store_id, created_at DESC
  LIMIT 1
) pah ON TRUE
WHERE p.quantity_available > 0 OR ss.quantity > 0
ORDER BY p.store_id, p.name;
