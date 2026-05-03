-- ============================================================================
-- CONSOLIDATE DUPLICATE PRODUCTS & FIX QUANTITY_AVAILABLE
-- ============================================================================
-- Main product_id to keep: 75be0c2f-1c18-4376-ab09-bc8655bf17c9
-- Duplicates to merge: 15ca03c1-2c59-4ea4-9800-e29907e7435e (1 sale)
--                      c0f1761e-e326-4950-b07b-4c560c26b6b4 (1 sale)
-- ============================================================================

-- STEP 1: Update sales items to point to correct product_id
-- This consolidates all 10 sales to the main product record
UPDATE sales
SET items = (
    SELECT jsonb_agg(
        CASE 
            WHEN (item->>'product_id')::text IN ('15ca03c1-2c59-4ea4-9800-e29907e7435e', 'c0f1761e-e326-4950-b07b-4c560c26b6b4')
            THEN item || jsonb_build_object('product_id', '75be0c2f-1c18-4376-ab09-bc8655bf17c9')
            ELSE item
        END
    )
    FROM jsonb_array_elements(sales.items) AS item
)
WHERE items::text LIKE '%15ca03c1-2c59-4ea4-9800-e29907e7435e%'
   OR items::text LIKE '%c0f1761e-e326-4950-b07b-4c560c26b6b4%';


-- STEP 2: Recalculate quantity_available for the MAIN product
UPDATE products
SET quantity_available = (
    COALESCE(number_of_boxes, 0) - 
    COALESCE((
        SELECT SUM((item->>'quantity')::decimal)
        FROM sales s
        CROSS JOIN jsonb_array_elements(s.items) as item
        WHERE (item->>'product_id')::text = '75be0c2f-1c18-4376-ab09-bc8655bf17c9'::text
          AND s.store_id = products.store_id
    ), 0)
)::decimal,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '75be0c2f-1c18-4376-ab09-bc8655bf17c9'::uuid;


-- STEP 3: Delete correction log entries for duplicate products (cleanup)
DELETE FROM quantity_available_corrections_log
WHERE product_id IN ('15ca03c1-2c59-4ea4-9800-e29907e7435e', 'c0f1761e-e326-4950-b07b-4c560c26b6b4');


-- STEP 3B: Delete duplicate product records
DELETE FROM products
WHERE reference = 'P272583484'
  AND id != '75be0c2f-1c18-4376-ab09-bc8655bf17c9'::uuid;


-- STEP 4: Verify the fix
SELECT 
    id,
    reference,
    name,
    quantity_available,
    number_of_boxes,
    (number_of_boxes - quantity_available) as total_sold,
    store_id
FROM products
WHERE reference = 'P272583484';
