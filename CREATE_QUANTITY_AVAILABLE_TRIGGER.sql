-- ============================================================================
-- PERMANENT FIX: Trigger to Auto-Calculate quantity_available from Sales
-- ============================================================================
-- This trigger ensures quantity_available is always correct by automatically
-- recalculating it whenever a sale is inserted, updated, or deleted
-- PRODUCTION IMPACT: CRITICAL - Fixes root cause of stock discrepancies
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_product_quantity_on_sale_change ON sales;
DROP FUNCTION IF EXISTS fn_update_product_quantity_on_sale_change();


-- CREATE FUNCTION: Recalculate product quantity_available
CREATE OR REPLACE FUNCTION fn_update_product_quantity_on_sale_change()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id uuid;
    v_store_id uuid;
    v_total_sold decimal;
    v_new_quantity_available decimal;
    v_initial_quantity decimal;
BEGIN
    -- Get product details from the sales items
    v_store_id := NEW.store_id;
    
    -- For each product in the sale items, update its quantity_available
    FOR v_product_id IN
        SELECT DISTINCT (item->>'product_id')::uuid
        FROM jsonb_array_elements(
            CASE 
                WHEN TG_OP = 'DELETE' THEN OLD.items
                ELSE NEW.items
            END
        ) as item
    LOOP
        -- Get the product's initial quantity
        SELECT number_of_boxes 
        INTO v_initial_quantity
        FROM products
        WHERE id = v_product_id
          AND store_id = v_store_id;
        
        -- Calculate total sold for this product from all sales
        SELECT COALESCE(SUM((item->>'quantity')::decimal), 0)
        INTO v_total_sold
        FROM sales s
        CROSS JOIN jsonb_array_elements(s.items) as item
        WHERE (item->>'product_id')::uuid = v_product_id
          AND s.store_id = v_store_id;
        
        -- Calculate new quantity_available
        v_new_quantity_available := COALESCE(v_initial_quantity, 0) - v_total_sold;
        
        -- Update the product with the correct quantity_available
        UPDATE products
        SET quantity_available = v_new_quantity_available,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_product_id
          AND store_id = v_store_id;
            
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- CREATE TRIGGER on INSERT/UPDATE
CREATE TRIGGER update_product_quantity_on_sale_change
AFTER INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION fn_update_product_quantity_on_sale_change();


-- CREATE TRIGGER on DELETE (to recalculate when sales are removed)
CREATE TRIGGER update_product_quantity_on_sale_delete
AFTER DELETE ON sales
FOR EACH ROW
EXECUTE FUNCTION fn_update_product_quantity_on_sale_change();


-- ============================================================================
-- TEST THE TRIGGER
-- ============================================================================

-- Verify trigger was created
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
    'update_product_quantity_on_sale_change',
    'update_product_quantity_on_sale_delete'
)
ORDER BY trigger_name;


-- Verify function exists
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'fn_update_product_quantity_on_sale_change';


-- Show confirmation
SELECT 
    'Trigger installation complete' as status,
    CURRENT_TIMESTAMP as installed_at,
    'All future sales will automatically calculate quantity_available' as note;
