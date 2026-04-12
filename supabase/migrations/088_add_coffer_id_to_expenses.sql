-- Add coffer_id to expenses to support coffer deposits/expenses tracking
-- Fixes: Could not find the 'coffer_id' column of 'expenses' in the schema cache

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS coffer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_coffer_id ON expenses(coffer_id);

COMMENT ON COLUMN expenses.coffer_id IS 'Optional coffer identifier (e.g., main, coffer-<timestamp>) for coffer-related movements';
