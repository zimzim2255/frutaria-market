-- ============================================================================
-- DIAGNOSTIC QUERY: Identify All Products with Incorrect quantity_available
-- ============================================================================
-- This query finds all products where quantity_available doesn't match the
-- expected value (initial quantity - total sold quantity)
-- PRODUCTION SAFE: READ-ONLY QUERY
-- ============================================================================

-- Step 1: Show products with calculation discrepancies
SELECT 
    p.id,
    p.reference,
    p.name,
    p.store_id,
    p.quantity_available as "displayed_quantity",
    p.number_of_boxes as "initial_boxes",
    COALESCE(p.number_of_boxes, 0) as "total_initial",
    
    -- Calculate total sold from sales.items JSONB
    (SELECT COALESCE(SUM((item->>'quantity')::decimal), 0)
     FROM sales s
     CROSS JOIN jsonb_array_elements(s.items) as item
     WHERE (item->>'product_id')::uuid = p.id
       AND s.store_id = p.store_id) as "total_sold",
    
    -- Expected quantity_available
    (COALESCE(p.number_of_boxes, 0) - 
     COALESCE((SELECT SUM((item->>'quantity')::decimal)
              FROM sales s
              CROSS JOIN jsonb_array_elements(s.items) as item
              WHERE (item->>'product_id')::uuid = p.id
                AND s.store_id = p.store_id), 0)) as "expected_quantity",
    
    -- Discrepancy
    (p.quantity_available - 
     (COALESCE(p.number_of_boxes, 0) - 
      COALESCE((SELECT SUM((item->>'quantity')::decimal)
               FROM sales s
               CROSS JOIN jsonb_array_elements(s.items) as item
               WHERE (item->>'product_id')::uuid = p.id
                 AND s.store_id = p.store_id), 0))) as "discrepancy",
    
    p.created_at
FROM products p
WHERE (p.quantity_available - 
       (COALESCE(p.number_of_boxes, 0) - 
        COALESCE((SELECT SUM((item->>'quantity')::decimal)
                 FROM sales s
                 CROSS JOIN jsonb_array_elements(s.items) as item
                 WHERE (item->>'product_id')::uuid = p.id
                   AND s.store_id = p.store_id), 0))) != 0
ORDER BY 
    ABS(p.quantity_available - 
        (COALESCE(p.number_of_boxes, 0) - 
         COALESCE((SELECT SUM((item->>'quantity')::decimal)
                  FROM sales s
                  CROSS JOIN jsonb_array_elements(s.items) as item
                  WHERE (item->>'product_id')::uuid = p.id
                    AND s.store_id = p.store_id), 0))) DESC;


-- Step 2: Specific product analysis (POIRE TEMAS/OFL124/813)
-- Replace with actual product_id as needed
WITH product_data AS (
    SELECT 
        p.id,
        p.reference,
        p.name,
        p.quantity_available as "displayed_qty",
        p.number_of_boxes as "initial_qty",
        p.store_id,
        p.created_at
    FROM products p
    WHERE p.reference = 'P272583484'
        AND p.name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76'
),
sold_data AS (
    SELECT 
        p.id,
        COUNT(*) as "num_sales",
        SUM((item->>'quantity')::decimal) as "total_qty_sold",
        SUM((item->>'caisse')::decimal) as "total_caisse_sold",
        jsonb_agg(
            jsonb_build_object(
                'sale_id', s.id,
                'qty', (item->>'quantity')::decimal,
                'caisse', (item->>'caisse')::decimal,
                'created_at', s.created_at
            )
        ) as "sales_details"
    FROM products p
    JOIN sales s ON s.store_id = p.store_id
    CROSS JOIN jsonb_array_elements(s.items) as item
    WHERE (item->>'product_id')::uuid = p.id
        AND p.reference = 'P272583484'
    GROUP BY p.id
)
SELECT 
    pd.*,
    sd.num_sales,
    sd.total_qty_sold,
    sd.total_caisse_sold,
    (pd.initial_qty - COALESCE(sd.total_qty_sold, 0))::decimal as "expected_qty_remaining",
    (pd.displayed_qty - (pd.initial_qty - COALESCE(sd.total_qty_sold, 0)))::decimal as "discrepancy",
    sd.sales_details
FROM product_data pd
LEFT JOIN sold_data sd ON pd.id = sd.id;


-- Step 3: Count total products affected
SELECT 
    COUNT(*) as "total_products_with_discrepancies",
    COUNT(CASE WHEN ABS(discrepancy) > 0 THEN 1 END) as "products_with_errors",
    SUM(ABS(discrepancy)) as "total_unit_discrepancy",
    AVG(ABS(discrepancy)) as "avg_discrepancy_per_product",
    MAX(ABS(discrepancy)) as "max_discrepancy"
FROM (
    SELECT 
        (p.quantity_available - 
         (COALESCE(p.number_of_boxes, 0) - 
          COALESCE((SELECT SUM((item->>'quantity')::decimal)
                   FROM sales s
                   CROSS JOIN jsonb_array_elements(s.items) as item
                   WHERE (item->>'product_id')::uuid = p.id
                     AND s.store_id = p.store_id), 0))) as "discrepancy"
    FROM products p
    WHERE p.created_at >= CURRENT_DATE - INTERVAL '7 days'
) analysis;
