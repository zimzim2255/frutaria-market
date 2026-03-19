-- Fix sale_items.caisse to support decimal values (e.g. 1.5)
-- Error fixed: 22P02 invalid input syntax for type integer: "1.5"
--
-- Context:
-- Frontend (BonCommandeModule) can send caisse as a decimal string ("1.5").
-- Some DBs still have sale_items.caisse as INTEGER from older migrations.
--
-- This migration converts it to NUMERIC(12,3).

begin;

alter table public.sale_items
  alter column caisse type numeric(12,3)
  using (caisse::numeric);

commit;
