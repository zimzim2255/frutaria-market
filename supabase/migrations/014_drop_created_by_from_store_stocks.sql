-- Drop the created_by column from store_stocks table
ALTER TABLE store_stocks DROP COLUMN IF EXISTS created_by;
