-- ============================================================================
-- FIND WHICH PRODUCT_ID HAS THE ACTUAL SALES
-- ============================================================================

-- Check sales linked to each product_id
SELECT 
    p.id,
    p.reference,
    p.name,
    p.quantity_available,
    p.number_of_boxes,
    COUNT(DISTINCT s.id) as num_sales,
    SUM((item->>'quantity')::decimal) as total_sold
FROM products p
LEFT JOIN sales s ON s.store_id = p.store_id
LEFT JOIN jsonb_array_elements(s.items) as item ON (item->>'product_id')::text = p.id::text
WHERE p.reference = 'P272583484'
GROUP BY p.id, p.reference, p.name, p.quantity_available, p.number_of_boxes
ORDER BY num_sales DESC;


-- ============================================================================
-- SHOW WHICH SALES ITEM HAS WHICH PRODUCT_ID
-- ============================================================================

-- Extract all product_ids from sales items
SELECT DISTINCT 
    (item->>'product_id')::text as product_uuid,
    (item->>'reference')::text as reference,
    (item->>'name')::text as item_name,
    COUNT(*) as times_in_sales
FROM sales s
CROSS JOIN jsonb_array_elements(s.items) as item
WHERE (item->>'reference')::text = 'P272583484'
GROUP BY (item->>'product_id')::text, (item->>'reference')::text, (item->>'name')::text
ORDER BY times_in_sales DESC;
