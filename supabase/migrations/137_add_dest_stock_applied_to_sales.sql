-- Adds a durable idempotency marker for receiver stock application.
--
-- Problem:
--   POST /sales/:id/confirm-delivery can be retried (network / edge runtime) or raced.
--   Using sales.notes markers is not reliable/atomic, which can lead to duplicate stock adds.
--
-- Fix:
--   Add a dedicated boolean column sales.dest_stock_applied and backfill from legacy notes marker.

ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS dest_stock_applied boolean NOT NULL DEFAULT false;

-- Backfill legacy rows that already had the notes marker.
UPDATE public.sales
SET dest_stock_applied = true
WHERE dest_stock_applied = false
  AND notes ILIKE '%dest_stock_applied=1%';

-- Helpful index for quick lookups (optional but cheap).
CREATE INDEX IF NOT EXISTS sales_dest_stock_applied_idx
  ON public.sales (dest_stock_applied);
