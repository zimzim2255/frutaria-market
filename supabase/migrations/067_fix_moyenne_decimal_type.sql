-- Migration: Fix avg_net_weight_per_box to properly support decimal values
-- Problem: The "Moyenne" column was rejecting decimal values like 16.5
-- Solution: Ensure the column is DECIMAL type and update the trigger function

BEGIN;

-- Step 1: Drop the existing trigger that might be causing issues
DROP TRIGGER IF EXISTS trigger_calculate_avg_weight ON products;

-- Step 2: Ensure avg_net_weight_per_box is DECIMAL(15, 2) for better precision
ALTER TABLE products
ALTER COLUMN avg_net_weight_per_box TYPE DECIMAL(15, 2) USING avg_net_weight_per_box::DECIMAL(15, 2);

-- Step 3: Recreate the trigger function with proper DECIMAL handling
DROP FUNCTION IF EXISTS calculate_avg_weight();

CREATE OR REPLACE FUNCTION calculate_avg_weight()
RETURNS TRIGGER AS $$
BEGIN
  -- Only calculate if both number_of_boxes and total_net_weight are provided
  IF NEW.number_of_boxes > 0 AND NEW.total_net_weight IS NOT NULL THEN
    -- Ensure the result is DECIMAL type
    NEW.avg_net_weight_per_box := (NEW.total_net_weight::DECIMAL(15, 2) / NEW.number_of_boxes::DECIMAL(15, 2))::DECIMAL(15, 2);
  ELSE
    -- If not calculating, ensure it's still DECIMAL type
    NEW.avg_net_weight_per_box := COALESCE(NEW.avg_net_weight_per_box::DECIMAL(15, 2), NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Recreate the trigger
CREATE TRIGGER trigger_calculate_avg_weight
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION calculate_avg_weight();

-- Step 5: Update comments
COMMENT ON COLUMN products.avg_net_weight_per_box IS 'Average net weight per box (supports decimal values like 16.5)';

-- Step 6: Verify the column type
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
AND column_name = 'avg_net_weight_per_box';

COMMIT;
