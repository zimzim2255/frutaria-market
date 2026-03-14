-- Drop the foreign key constraint on users.id
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;

-- Make id a regular UUID column instead of a foreign key
-- The id column will still be the primary key but won't reference auth.users
-- This allows us to create users independently without requiring them in auth.users
