-- Add notes column to expenses table (used for coffer movements reference/notes)

ALTER TABLE IF EXISTS expenses
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Optional: index for text search / filtering
-- CREATE INDEX IF NOT EXISTS idx_expenses_notes ON expenses USING gin (to_tsvector('simple', coalesce(notes,'')));
