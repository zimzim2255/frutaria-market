-- Backfill existing admin users into suppliers table
--
-- Goal: existing users with role='admin' should have a corresponding supplier row
-- linked by suppliers.admin_user_id = users.id.
--
-- This is safe to run multiple times (idempotent).

-- 1) Ensure the linking column exists
alter table public.suppliers
add column if not exists admin_user_id uuid;

-- 2) Ensure uniqueness (1 supplier per admin)
create unique index if not exists suppliers_admin_user_id_unique
on public.suppliers (admin_user_id)
where admin_user_id is not null;

-- 3) Backfill: insert missing supplier rows for ALL existing admins
-- IMPORTANT: we do NOT require users.store_id (admins can have store_id NULL).
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
  and not exists (
    select 1
    from public.suppliers s
    where s.admin_user_id = u.id
  );

-- 4) Repair: if a supplier row is already linked but has empty name/email, fill from users
update public.suppliers s
set
  name  = coalesce(nullif(trim(s.name), ''), nullif(trim(u.email), ''), u.id::text),
  email = coalesce(nullif(trim(s.email), ''), u.email),
  store_id = coalesce(s.store_id, u.store_id)
from public.users u
where s.admin_user_id = u.id;
