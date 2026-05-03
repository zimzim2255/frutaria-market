-- Reset all quantity to 0 in store_stocks table
UPDATE store_stocks
SET quantity = 0
WHERE quantity IS NOT NULL OR quantity IS NULL;

-- Verify the update
SELECT COUNT(*) as total_store_stocks, 
       SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as stocks_with_zero
FROM store_stocks;
