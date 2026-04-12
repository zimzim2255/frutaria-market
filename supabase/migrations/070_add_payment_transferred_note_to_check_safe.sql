-- Add payment_transferred_note to check_safe
-- Stores destination/bank note when a payment is marked as transferred.
-- Idempotent.

ALTER TABLE public.check_safe
ADD COLUMN IF NOT EXISTS payment_transferred_note text;
