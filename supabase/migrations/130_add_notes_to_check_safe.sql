-- Add notes column to check_safe for compatibility with handler and legacy queries
-- Some parts of the codebase use `check_safe.notes` for idempotency/link markers.
-- If your DB was created without that column, inserts/queries will fail with PGRST204/42703.

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS notes text;

-- pg_trgm provides gin_trgm_ops used for fast ILIKE/contains searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Helpful index for common lookup patterns used in handlers
CREATE INDEX IF NOT EXISTS idx_check_safe_notes_trgm
ON public.check_safe
USING gin (notes gin_trgm_ops);
