-- Add coffer_id to check_inventory so confirmed magasin payments can be placed into a selected coffre
-- This fixes: "admin chooses which coffre" -> the check row is actually linked to that coffre.

ALTER TABLE IF EXISTS public.check_inventory
ADD COLUMN IF NOT EXISTS coffer_id text;

CREATE INDEX IF NOT EXISTS idx_check_inventory_coffer_id
ON public.check_inventory (coffer_id);
