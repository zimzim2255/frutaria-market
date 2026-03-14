-- Add permissions column to users table
ALTER TABLE users ADD COLUMN permissions JSONB DEFAULT '[]'::jsonb;

-- Add comment to explain the column
COMMENT ON COLUMN users.permissions IS 'Array of permission strings defining what the user can access in the app';