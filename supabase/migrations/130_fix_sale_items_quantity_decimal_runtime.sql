-- Fix sale_items.quantity to support decimal quantities (e.g. 1.5 KG)
-- Error fixed: 22P02 invalid input syntax for type integer: "1.5"
--
-- Context:
-- The app inserts decimal quantities into public.sale_items.quantity.
-- Some DBs still have this column as INTEGER from early schema.
--
-- This migration converts it to NUMERIC(12,3).

begin;

alter table public.sale_items
  alter column quantity type numeric(12,3)
  using (quantity::numeric);

commit;
