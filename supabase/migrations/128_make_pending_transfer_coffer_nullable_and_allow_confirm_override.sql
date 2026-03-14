-- 128_make_pending_transfer_coffer_nullable_and_allow_confirm_override.sql
-- Goal: allow admin to choose ANY coffer at confirmation time.
-- Current issue: pending_coffer_transfers.target_coffer_id is NOT NULL,
-- so we cannot represent "not selected yet" cleanly.
--
-- This migration:
-- 1) makes target_coffer_id nullable
-- 2) keeps/creates FK to coffers(id) with ON DELETE SET NULL
-- 3) keeps/creates an index for filtering
--
-- Safe/idempotent: uses IF EXISTS / guarded blocks where possible.

begin;

-- 1) Make nullable
alter table if exists public.pending_coffer_transfers
  alter column target_coffer_id drop not null;

-- 2) Ensure FK exists with ON DELETE SET NULL.
-- Drop older constraint if it exists (name may differ across environments).
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.pending_coffer_transfers'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%(target_coffer_id)%'
    and pg_get_constraintdef(oid) ilike '%references%coffers%';

  if constraint_name is not null then
    execute format('alter table public.pending_coffer_transfers drop constraint %I', constraint_name);
  end if;
exception when undefined_table then
  -- table does not exist in this environment
  null;
end $$;

alter table if exists public.pending_coffer_transfers
  add constraint pending_coffer_transfers_target_coffer_id_fkey
  foreign key (target_coffer_id)
  references public.coffers(id)
  on delete set null;

-- 3) Index for common filters
create index if not exists idx_pending_coffer_transfers_target_coffer_id
  on public.pending_coffer_transfers(target_coffer_id);

commit;
