-- Backfill admin suppliers so they can be selected in "➕ Ajouter un produit"
--
-- This migration ensures that existing admin users are represented as suppliers
-- and linked via suppliers.admin_user_id.
--
-- Notes:
-- - We only backfill admins with a non-null store_id (otherwise they are not scoped).
-- - We keep it idempotent (safe to re-run).

-- 1) Ensure column exists
alter table public.suppliers
add column if not exists admin_user_id uuid;

-- 2) Ensure uniqueness (1 supplier per admin user)
create unique index if not exists suppliers_admin_user_id_unique
on public.suppliers (admin_user_id)
where admin_user_id is not null;

-- 3) Backfill: insert a supplier row for each existing admin (skip if already exists)
insert into public.suppliers (
  store_id,
  name,
  email,
  phone,
  address,
  city,
  postal_code,
  contact_person,
  payment_terms,
  is_passage,
  balance,
  status,
  created_by,
  admin_user_id
)
select
  u.store_id,
  coalesce(nullif(trim(u.email), ''), u.id::text) as name,
  u.email,
  null,
  null,
  null,
  null,
  null,
  null,
  false,
  0,
  'active',
  u.id,
  u.id
from public.users u
where lower(u.role) = 'admin'
  and u.store_id is not null
  and not exists (
    select 1
    from public.suppliers s
    where s.admin_user_id = u.id
  );

-- 4) Repair: for already-linked rows missing name/email, backfill from users
update public.suppliers s
set
  name  = coalesce(nullif(trim(s.name), ''), nullif(trim(u.email), ''), u.id::text),
  email = coalesce(nullif(trim(s.email), ''), u.email)
from public.users u
where s.admin_user_id = u.id;
