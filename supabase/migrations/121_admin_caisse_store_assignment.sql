-- Ensure every admin user has a dedicated caisse store_id.
--
-- Policy:
-- 1) Create a dedicated store for each admin user (if none exists).
-- 2) Set users.store_id = that store.id.
-- 3) Keep it idempotent.
--
-- Notes:
-- - This assumes the app uses public.users as the authoritative user table.
-- - This does NOT affect normal magasins; it only creates/links a caisse-store per admin.

-- 0) Add helper columns if you want to track admin caisse stores explicitly.
-- (Optional; keep minimal for now)

-- 1) Create one store per admin user if missing.
-- We create it with a deterministic name and link it via stores.user_id.
insert into public.stores (name, email, phone, address, city, postal_code, contact_person, balance, status, user_id)
select
  concat('Caisse Admin - ', coalesce(nullif(trim(u.email), ''), u.id::text)) as name,
  u.email,
  null,
  null,
  null,
  null,
  null,
  0,
  'active',
  u.id
from public.users u
where lower(u.role) = 'admin'
  and not exists (
    select 1
    from public.stores s
    where s.user_id = u.id
  );

-- 2) Backfill users.store_id for admins that don't have one.
-- Prefer the store linked by stores.user_id.
update public.users u
set store_id = s.id
from public.stores s
where lower(u.role) = 'admin'
  and (u.store_id is null)
  and s.user_id = u.id;

-- 3) If still missing (edge cases), assign ANY store linked to that admin user.
-- (Should be no-op after step 2, but keeps migration safe.)
update public.users u
set store_id = (
  select s.id
  from public.stores s
  where s.user_id = u.id
  order by s.created_at asc
  limit 1
)
where lower(u.role) = 'admin'
  and u.store_id is null;

-- 4) Create/replace trigger to ensure future admin users always get a caisse store.
create or replace function public.ensure_admin_caisse_store()
returns trigger
language plpgsql
as $$
begin
  if lower(new.role) = 'admin' then
    -- Create store if missing
    insert into public.stores (name, email, balance, status, user_id)
    values (
      concat('Caisse Admin - ', coalesce(nullif(trim(new.email), ''), new.id::text)),
      new.email,
      0,
      'active',
      new.id
    )
    on conflict do nothing;

    -- Set users.store_id if missing
    if new.store_id is null then
      update public.users u
      set store_id = (
        select s.id
        from public.stores s
        where s.user_id = new.id
        order by s.created_at asc
        limit 1
      )
      where u.id = new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_admin_caisse_store on public.users;

create trigger trg_ensure_admin_caisse_store
after insert or update of role, email
on public.users
for each row
execute function public.ensure_admin_caisse_store();
