-- Reset all quantity_available to 0 in products table
UPDATE products
SET quantity_available = 0
WHERE quantity_available IS NOT NULL OR quantity_available IS NULL;

-- Verify the update
SELECT COUNT(*) as total_products, 
       SUM(CASE WHEN quantity_available = 0 THEN 1 ELSE 0 END) as products_with_zero
FROM products;
