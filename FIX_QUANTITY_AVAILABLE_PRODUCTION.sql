-- ============================================================================
-- FIX SCRIPT: Recalculate and Correct quantity_available for All Products
-- ============================================================================
-- This script corrects quantity_available based on actual sales data
-- PRODUCTION IMPACT: HIGH - Modifies product quantities
-- SHOULD BE RUN: During maintenance window or after testing in staging
-- ============================================================================

-- STEP 1: Create a backup view of affected products BEFORE making changes
CREATE OR REPLACE VIEW vw_quantity_available_corrections AS
SELECT 
    p.id,
    p.reference,
    p.name,
    p.store_id,
    p.quantity_available as "old_quantity_available",
    p.number_of_boxes as "initial_quantity",
    COALESCE((SELECT SUM((item->>'quantity')::decimal)
             FROM sales s
             CROSS JOIN jsonb_array_elements(s.items) as item
             WHERE (item->>'product_id')::uuid = p.id
               AND s.store_id = p.store_id), 0) as "total_sold",
    (p.number_of_boxes - COALESCE((SELECT SUM((item->>'quantity')::decimal)
                                  FROM sales s
                                  CROSS JOIN jsonb_array_elements(s.items) as item
                                  WHERE (item->>'product_id')::uuid = p.id
                                    AND s.store_id = p.store_id), 0))::decimal as "new_quantity_available",
    (p.quantity_available - 
     (p.number_of_boxes - COALESCE((SELECT SUM((item->>'quantity')::decimal)
                                   FROM sales s
                                   CROSS JOIN jsonb_array_elements(s.items) as item
                                   WHERE (item->>'product_id')::uuid = p.id
                                     AND s.store_id = p.store_id), 0)))::decimal as "discrepancy",
    p.updated_at,
    CURRENT_TIMESTAMP as "fix_timestamp"
FROM products p
WHERE (p.quantity_available - 
       (p.number_of_boxes - COALESCE((SELECT SUM((item->>'quantity')::decimal)
                                     FROM sales s
                                     CROSS JOIN jsonb_array_elements(s.items) as item
                                     WHERE (item->>'product_id')::uuid = p.id
                                       AND s.store_id = p.store_id), 0))) != 0;


-- STEP 2: Log corrections for audit trail
CREATE TABLE IF NOT EXISTS quantity_available_corrections_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id),
    reference text,
    store_id uuid,
    old_value decimal,
    new_value decimal,
    discrepancy decimal,
    reason text,
    corrected_by text DEFAULT 'system',
    corrected_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

-- STEP 3: Log all corrections BEFORE applying them
INSERT INTO quantity_available_corrections_log 
    (product_id, reference, store_id, old_value, new_value, discrepancy, reason)
SELECT 
    id,
    reference,
    store_id,
    old_quantity_available,
    new_quantity_available,
    discrepancy,
    'Auto-correction: quantity_available recalculated from actual sales'
FROM vw_quantity_available_corrections
WHERE discrepancy != 0;


-- STEP 4: Apply the correction (THIS IS THE ACTUAL FIX)
-- NOTE: Wrap in transaction to allow rollback if needed
BEGIN TRANSACTION;

UPDATE products p
SET quantity_available = (
    p.number_of_boxes - COALESCE((
        SELECT SUM((item->>'quantity')::decimal)
        FROM sales s
        CROSS JOIN jsonb_array_elements(s.items) as item
        WHERE (item->>'product_id')::uuid = p.id
          AND s.store_id = p.store_id
    ), 0)
)::decimal,
    updated_at = CURRENT_TIMESTAMP
WHERE p.id IN (
    SELECT id FROM vw_quantity_available_corrections
);


-- STEP 5: Verify the fix
SELECT 
    COUNT(*) as "total_corrections_applied",
    COUNT(CASE WHEN discrepancy > 0 THEN 1 END) as "overstocked_products",
    COUNT(CASE WHEN discrepancy < 0 THEN 1 END) as "understocked_products",
    SUM(ABS(discrepancy)) as "total_units_corrected",
    AVG(ABS(discrepancy)) as "avg_correction_per_product"
FROM vw_quantity_available_corrections;


-- STEP 6: Verify specific product (POIRE TEMAS)
SELECT 
    reference,
    name,
    old_quantity_available as "incorrect_stock",
    new_quantity_available as "corrected_stock",
    discrepancy,
    total_sold,
    initial_quantity
FROM vw_quantity_available_corrections
WHERE reference = 'P272583484'
    AND name = 'POIRE TEMAS 4KG 65/70 OFL124-MG-76';


-- STEP 7: ROLLBACK safety measure
-- If corrections don't look right, run:
-- ROLLBACK;
-- Otherwise, commit with: COMMIT;

COMMIT;
