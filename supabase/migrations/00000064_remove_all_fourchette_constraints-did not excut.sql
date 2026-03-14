-- Migration: Remove ALL constraints on fourchette columns
-- This will find and remove any CHECK constraints that might be enforcing integer type

BEGIN;

-- Get all constraint names for fourchette columns and drop them
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN 
        SELECT constraint_name 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'products' 
        AND column_name IN ('fourchette_min', 'fourchette_max')
        AND constraint_type = 'CHECK'
    LOOP
        EXECUTE 'ALTER TABLE products DROP CONSTRAINT IF EXISTS ' || constraint_record.constraint_name || ' CASCADE';
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- Verify no CHECK constraints remain
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'products' 
AND constraint_type = 'CHECK';

COMMIT;
