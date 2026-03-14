-- ============================================
-- POPULATE EXISTING CHECKS WITH GIVER_ID
-- ============================================

-- For existing checks that don't have giver_id set,
-- we'll set them to the created_by user (who uploaded/created them)
UPDATE check_inventory
SET giver_id = created_by
WHERE giver_id IS NULL AND created_by IS NOT NULL;

-- Log the update
DO $$
DECLARE
  updated_count INT;
BEGIN
  SELECT COUNT(*) INTO updated_count FROM check_inventory WHERE giver_id IS NOT NULL;
  RAISE NOTICE 'Updated % checks with giver_id', updated_count;
END $$;
