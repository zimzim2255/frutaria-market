-- Create immutable, append-only history for "Ajout Stock" pages.
-- One row = one addition line (snapshot) used by /product-additions and /stock-reference-history.

create table if not exists public.product_additions_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null,
  created_by_email text null,

  store_id uuid null,
  product_id uuid null,

  stock_reference text null,
  reference text null,
  name text null,
  category text null,
  supplier_id uuid null,
  lot text null,

  purchase_price numeric null,
  sale_price numeric null,
  fourchette_min numeric null,
  fourchette_max numeric null,

  caisse numeric not null default 0,
  quantite numeric not null default 0,
  moyenne numeric not null default 0,
  total_value numeric not null default 0
);

-- Helpful indexes
create index if not exists product_additions_history_created_at_idx
  on public.product_additions_history (created_at desc);

create index if not exists product_additions_history_store_id_idx
  on public.product_additions_history (store_id);

create index if not exists product_additions_history_stock_reference_idx
  on public.product_additions_history (stock_reference);

create index if not exists product_additions_history_product_id_idx
  on public.product_additions_history (product_id);

-- Enable RLS
alter table public.product_additions_history enable row level security;

-- SELECT policy: any authenticated user can read.
-- NOTE: data scoping (admin vs store) is enforced by the edge function endpoint.
-- This policy is permissive because the edge function uses service role anyway.
create policy "product_additions_history_select_authenticated"
  on public.product_additions_history
  for select
  to authenticated
  using (true);

-- INSERT policy:
-- allow service role inserts (edge functions). We keep it blocked for normal users.
-- In Postgres, service role requests use the `service_role` JWT role; in RLS it maps to `service_role`.
create policy "product_additions_history_insert_service_role"
  on public.product_additions_history
  for insert
  to service_role
  with check (true);

-- Disallow UPDATE/DELETE for everyone (append-only)
create policy "product_additions_history_no_update"
  on public.product_additions_history
  for update
  to public
  using (false);

create policy "product_additions_history_no_delete"
  on public.product_additions_history
  for delete
  to public
  using (false);

-- Backfill existing rows once from current products table.
-- Must reproduce frontend mapping exactly as of now:
--  - Caisse   = products.quantity_available
--  - Quantité = products.number_of_boxes
--  - Moyenne  = products.avg_net_weight_per_box if present else Quantité/Caisse
--  - Valeur Totale = Caisse * Prix d'Achat (purchase_price)
insert into public.product_additions_history (
  created_at,
  created_by,
  created_by_email,
  store_id,
  product_id,
  stock_reference,
  reference,
  name,
  category,
  supplier_id,
  lot,
  purchase_price,
  sale_price,
  fourchette_min,
  fourchette_max,
  caisse,
  quantite,
  moyenne,
  total_value
)
select
  p.created_at,
  p.created_by,
  null::text as created_by_email,
  p.store_id,
  p.id as product_id,
  p.stock_reference,
  p.reference,
  p.name,
  p.category,
  p.supplier_id,
  p.lot,
  p.purchase_price,
  p.sale_price,
  p.fourchette_min,
  p.fourchette_max,
  coalesce(p.quantity_available::numeric, 0) as caisse,
  coalesce(p.number_of_boxes::numeric, 0) as quantite,
  case
    when coalesce(p.avg_net_weight_per_box::numeric, 0) > 0 then p.avg_net_weight_per_box::numeric
    when coalesce(p.quantity_available::numeric, 0) > 0 and coalesce(p.number_of_boxes::numeric, 0) > 0 then round((p.number_of_boxes::numeric / p.quantity_available::numeric)::numeric, 2)
    else 0
  end as moyenne,
  (coalesce(p.quantity_available::numeric, 0) * coalesce(p.purchase_price::numeric, 0)) as total_value
from public.products p;
