-- Fix order_items.quantity to support decimal quantities (e.g. 1.5)
-- Prevents: 22P02 invalid input syntax for type integer: "1.5"
--
-- Context:
-- Some frontend flows can send decimal quantities.
-- Older schema defines order_items.quantity as INTEGER.
--
-- This migration converts it to NUMERIC(12,3).

begin;

alter table public.order_items
  alter column quantity type numeric(12,3)
  using (quantity::numeric);

commit;
