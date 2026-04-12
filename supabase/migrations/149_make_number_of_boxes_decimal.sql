-- Make stock-related numeric fields decimal to preserve values like 45.5 / 1.2 / 3.4
-- This fixes UI inputs that accept decimals but were being stored as integers.
--
-- Affected flows:
-- - products.number_of_boxes (Caisse/Quantité in some screens)
-- - products.quantity_available (stock quantity)
-- - store_stocks.quantity (per-store stock)

begin;

-- quantity_available is referenced by view stock_summary.
-- Drop the view first, apply type changes, then recreate it.
drop view if exists public.stock_summary cascade;

alter table public.products
  alter column number_of_boxes type numeric
  using number_of_boxes::numeric;

alter table public.products
  alter column quantity_available type numeric
  using quantity_available::numeric;

alter table public.store_stocks
  alter column quantity type numeric
  using quantity::numeric;

-- Recreate stock_summary view (compatible with numeric quantity_available)
create or replace view public.stock_summary as
select
  p.id,
  p.name,
  p.reference,
  p.category,
  p.quantity_available,
  p.sale_price,
  p.avg_net_weight_per_box,
  sup.name as supplier_name
from public.products p
left join public.suppliers sup on p.supplier_id = sup.id
order by p.name;

commit;
