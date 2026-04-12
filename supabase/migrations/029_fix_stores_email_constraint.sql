-- Fix stores table email constraint
-- Make email nullable since clients don't need email
ALTER TABLE stores ALTER COLUMN email DROP NOT NULL;

-- Add a unique constraint only for non-null emails
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_email_key;
ALTER TABLE stores ADD CONSTRAINT stores_email_unique_when_not_null 
  UNIQUE NULLS NOT DISTINCT (email);
