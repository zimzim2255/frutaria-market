-- Migration: Remove ALL CHECK constraints on fourchette columns (with proper quoting)
-- This will find and remove any CHECK constraints that might be enforcing integer type

BEGIN;

-- Get all constraint names for fourchette columns and drop them
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'products' 
        AND constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE products DROP CONSTRAINT IF EXISTS "' || constraint_record.constraint_name || '" CASCADE';
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- Verify the column types are NUMERIC
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products' 
AND column_name IN ('fourchette_min', 'fourchette_max');

COMMIT;
