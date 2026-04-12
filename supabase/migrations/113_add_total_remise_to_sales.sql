-- Add persisted discount/remise amount to sales so BL history + exports can display it
-- Uses snake_case to avoid JS/Schema-cache issues.

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS total_remise DECIMAL(15, 2) DEFAULT 0;

-- Backfill from pending_discount for old rows (best-effort)
UPDATE sales
SET total_remise = COALESCE(total_remise, 0) + COALESCE(pending_discount, 0)
WHERE COALESCE(total_remise, 0) = 0 AND COALESCE(pending_discount, 0) > 0;
