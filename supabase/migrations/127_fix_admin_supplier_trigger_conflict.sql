-- Fix ensure_admin_supplier() trigger function: ON CONFLICT(admin_user_id) requires a UNIQUE constraint.
-- Some environments only have a partial unique index, which cannot be used by ON CONFLICT(column).
--
-- This migration makes the trigger idempotent by:
-- 1) ensuring admin_user_id column exists
-- 2) dropping/recreating the trigger function using a NOT EXISTS guard instead of ON CONFLICT
--
-- Safe to run multiple times.

-- 1) Ensure column exists
alter table public.suppliers
add column if not exists admin_user_id uuid;

-- 2) Create a UNIQUE constraint so ON CONFLICT(admin_user_id) is valid (optional but recommended).
-- If you prefer not to enforce uniqueness globally, comment this out and rely on the NOT EXISTS guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'suppliers_admin_user_id_key'
  ) THEN
    -- Add a real unique constraint (works with ON CONFLICT(column)).
    -- This allows only one supplier row per admin user.
    ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_admin_user_id_key UNIQUE (admin_user_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    -- already exists
    NULL;
END $$;

-- 3) Replace trigger function using NOT EXISTS (works even without ON CONFLICT support)
create or replace function public.ensure_admin_supplier()
returns trigger
language plpgsql
as $$
begin
  if lower(new.role) = 'admin' then
    -- Ensure supplier row exists for this admin user
    if not exists (
      select 1 from public.suppliers s where s.admin_user_id = new.id
    ) then
      insert into public.suppliers (store_id, name, email, balance, status, created_by, admin_user_id)
      values (
        new.store_id,
        coalesce(nullif(trim(new.email), ''), new.id::text),
        new.email,
        0,
        'active',
        new.id,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

-- 4) Recreate trigger (idempotent)
drop trigger if exists trg_admin_supplier on public.users;
create trigger trg_admin_supplier
after insert or update of role, store_id, email
on public.users
for each row
execute function public.ensure_admin_supplier();
