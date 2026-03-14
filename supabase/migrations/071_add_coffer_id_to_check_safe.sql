-- Add coffer_id column to check_safe table
ALTER TABLE check_safe
ADD COLUMN IF NOT EXISTS coffer_id TEXT DEFAULT 'main';

-- Create index for coffer_id
CREATE INDEX IF NOT EXISTS idx_check_safe_coffer_id ON check_safe(coffer_id);

-- Add comment
COMMENT ON COLUMN check_safe.coffer_id IS 'Coffer identifier for organizing checks into separate safes (default: main)';
