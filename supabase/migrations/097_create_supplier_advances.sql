-- Create supplier advances system
-- Stores advance payments made to suppliers from a specific coffer, with full audit info.

create table if not exists public.supplier_advances (
  id uuid primary key default gen_random_uuid(),

  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete set null,

  -- coffer reference: in this app coffers are currently client-side ids (e.g. "main", "coffer-...")
  coffer_id text not null,
  coffer_name text null,

  amount numeric not null default 0,
  currency text not null default 'MAD',

  payment_method text not null,
  check_reference text null,
  bank_transfer_reference text null,
  bank_transfer_date date null,

  notes text null,

  created_by uuid null,
  created_by_email text null,
  created_by_role text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Minimal constraints (keep flexible with existing data patterns)
alter table public.supplier_advances
  add constraint supplier_advances_amount_non_negative
  check (amount >= 0);

alter table public.supplier_advances
  add constraint supplier_advances_payment_method_check
  check (payment_method in ('cash', 'check', 'bank_transfer'));

create index if not exists supplier_advances_supplier_id_idx on public.supplier_advances (supplier_id);
create index if not exists supplier_advances_store_id_idx on public.supplier_advances (store_id);
create index if not exists supplier_advances_created_at_idx on public.supplier_advances (created_at desc);

-- Trigger to keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_supplier_advances_updated_at on public.supplier_advances;
create trigger trg_supplier_advances_updated_at
before update on public.supplier_advances
for each row
execute function public.set_updated_at();
