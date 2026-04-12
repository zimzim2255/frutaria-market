-- Adds a durable, DB-level idempotency mechanism for stock movements.
-- This prevents double stock application under retries/race conditions.

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sale_id uuid null,
  order_id uuid null,
  store_id uuid not null,
  product_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  quantity numeric not null check (quantity > 0),
  reason text null,
  notes text null
);

-- One movement per (sale, store, product, direction, reason) to make the operation idempotent.
create unique index if not exists stock_movements_sale_store_product_dir_reason_uniq
  on public.stock_movements (sale_id, store_id, product_id, direction, coalesce(reason, ''))
  where sale_id is not null;

create index if not exists stock_movements_sale_id_idx on public.stock_movements (sale_id);
create index if not exists stock_movements_store_product_idx on public.stock_movements (store_id, product_id);
