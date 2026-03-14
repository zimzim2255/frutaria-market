-- Add user activity tracking fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for active users queries
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);

-- Add comment for documentation
COMMENT ON COLUMN users.last_login IS 'Timestamp of user last login';
COMMENT ON COLUMN users.last_logout IS 'Timestamp of user last logout';
COMMENT ON COLUMN users.is_active IS 'Whether the user account is active (admin can toggle)';
