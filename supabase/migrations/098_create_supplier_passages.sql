-- Supplier passages (fournisseur passage / exceptionnel)
-- Additive migration only (safe for production).

create table if not exists public.supplier_passages (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete set null,

  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MAD',
  payment_method text null,
  reference text null,
  notes text null,
  passage_date timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  created_by uuid null,
  created_by_email text null,
  created_by_role text null
);

create index if not exists supplier_passages_supplier_id_idx on public.supplier_passages (supplier_id);
create index if not exists supplier_passages_store_id_idx on public.supplier_passages (store_id);
create index if not exists supplier_passages_created_at_idx on public.supplier_passages (created_at desc);

-- Mark suppliers as "passage" (temporary/exceptional)
alter table public.suppliers
  add column if not exists is_passage boolean not null default false;

create index if not exists suppliers_is_passage_idx on public.suppliers (is_passage);

-- Keep updated_at in sync (if trigger exists in your DB it will handle it; otherwise this column is harmless)
