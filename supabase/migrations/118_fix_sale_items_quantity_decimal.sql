-- Fix sale_items.quantity to support decimal quantities (e.g. 4.2 KG)
-- This prevents 22P02 invalid input syntax for type integer.
--
-- Business note:
-- - `sale_items.caisse` drives stock movements (store_stocks.quantity)
-- - `sale_items.quantity` is for reporting (KG) and must support decimals

begin;

-- 1) Ensure column exists and convert to numeric.
-- Choose a scale that covers typical KG decimals.
alter table public.sale_items
  alter column quantity type numeric(12,3)
  using (quantity::numeric);

-- 2) Optional: keep default and NOT NULL as-is if present.
-- If your schema allows NULL and you want to enforce it later, do it in a separate migration.

commit;
