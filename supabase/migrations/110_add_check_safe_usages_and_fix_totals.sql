-- Add a DB-backed ledger of check usage inside the Coffre (safe)
-- so we can compute:
-- - montant_cheques_transferred: total checks moved into the safe (historical)
-- - montant_cheque: checks still available in the safe after being USED by coffer operations
--   (supplier advances, supplier global payments, coffer expenses) 

-- 1) Ledger table
create table if not exists public.check_safe_usages (
  id uuid primary key default uuid_generate_v4(),
  check_safe_id uuid not null references public.check_safe(id) on delete cascade,
  store_id uuid null references public.stores(id) on delete set null,
  coffer_id text not null default 'main',
  amount_used numeric not null default 0,
  usage_type text not null,
  ref_table text null,
  ref_id uuid null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_check_safe_usages_check_safe_id on public.check_safe_usages(check_safe_id);
create index if not exists idx_check_safe_usages_store_coffer on public.check_safe_usages(store_id, coffer_id);
create index if not exists idx_check_safe_usages_created_at on public.check_safe_usages(created_at);

comment on table public.check_safe_usages is 'Ledger of how much of a check_safe entry was consumed by Coffre operations (advances/payments/expenses).';
comment on column public.check_safe_usages.usage_type is 'Type of usage: supplier_advance | supplier_global_payment | coffer_expense | other';

-- RLS (keep consistent with existing patterns)
alter table public.check_safe_usages enable row level security;

drop policy if exists "Check safe usages viewable by authenticated users" on public.check_safe_usages;
create policy "Check safe usages viewable by authenticated users" on public.check_safe_usages
  for select using (auth.role() = 'authenticated');

drop policy if exists "Check safe usages can be created by authenticated users" on public.check_safe_usages;
create policy "Check safe usages can be created by authenticated users" on public.check_safe_usages
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Check safe usages can be updated by authenticated users" on public.check_safe_usages;
create policy "Check safe usages can be updated by authenticated users" on public.check_safe_usages
  for update using (auth.role() = 'authenticated');

drop policy if exists "Check safe usages can be deleted by authenticated users" on public.check_safe_usages;
create policy "Check safe usages can be deleted by authenticated users" on public.check_safe_usages
  for delete using (auth.role() = 'authenticated');


-- 2) Fix coffer totals view: "Montant (Chèque)" = remaining in safe after usages
-- NOTE: This replaces the previous view definition.
create or replace view public.coffer_totals_v1 as
with
  safe_totals as (
    select
      cs.store_id,
      coalesce(cs.coffer_id, 'main') as coffer_id,
      sum(coalesce(cs.amount, 0))::numeric as transferred_total
    from public.check_safe cs
    group by cs.store_id, coalesce(cs.coffer_id, 'main')
  ),

  safe_used as (
    select
      u.store_id,
      coalesce(u.coffer_id, 'main') as coffer_id,
      sum(coalesce(u.amount_used, 0))::numeric as used_total
    from public.check_safe_usages u
    group by u.store_id, coalesce(u.coffer_id, 'main')
  ),

  movements_by_store_coffer as (
    select
      e.store_id,
      coalesce(e.coffer_id, 'main') as coffer_id,
      sum(coalesce(e.amount, 0))::numeric as montant_movements_total,

      sum(
        case
          when lower(coalesce(e.expense_type, '')) = 'coffer_deposit_cash'
            or lower(coalesce(e.expense_type, '')) like '%cash%'
            or lower(coalesce(e.expense_type, '')) like '%espece%'
            or lower(coalesce(e.expense_type, '')) like '%espèce%'
          then coalesce(e.amount, 0)
          else 0
        end
      )::numeric as montant_espece,

      sum(
        case
          when lower(coalesce(e.expense_type, '')) = 'coffer_deposit_check'
            or lower(coalesce(e.expense_type, '')) like '%check%'
            or lower(coalesce(e.expense_type, '')) like '%cheque%'
            or lower(coalesce(e.expense_type, '')) like '%chèque%'
          then coalesce(e.amount, 0)
          else 0
        end
      )::numeric as montant_mouvement_cheque,

      sum(
        case
          when lower(coalesce(e.expense_type, '')) = 'coffer_deposit_bank_transfer'
            or lower(coalesce(e.expense_type, '')) like '%bank_transfer%'
            or lower(coalesce(e.expense_type, '')) like '%transfer%'
            or lower(coalesce(e.expense_type, '')) like '%virement%'
          then coalesce(e.amount, 0)
          else 0
        end
      )::numeric as montant_mouvement_virement
    from public.expenses e
    where e.coffer_id is not null
    group by e.store_id, coalesce(e.coffer_id, 'main')
  )

select
  m.store_id,
  m.coffer_id,

  -- Keep this card for backward compatibility.
  -- "Non transférés" should continue to reflect inventory checks not yet transferred.
  -- (Some UI cards still rely on it.)
  coalesce(inv.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- transferred total = safe transferred checks + all movements
  (coalesce(st.transferred_total, 0) + coalesce(m.montant_movements_total, 0))::numeric as montant_transferes,

  -- espèce = cash movements only
  coalesce(m.montant_espece, 0)::numeric as montant_espece,

  -- chèque (AVAILABLE IN COFFRE) = remaining safe checks after usages + check movements
  (greatest(0, coalesce(st.transferred_total, 0) - coalesce(su.used_total, 0)) + coalesce(m.montant_mouvement_cheque, 0))::numeric as montant_cheque,

  -- breakdown
  coalesce(st.transferred_total, 0)::numeric as montant_cheques_transferred,
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,
  coalesce(m.montant_mouvement_virement, 0)::numeric as montant_virement

from movements_by_store_coffer m
left join safe_totals st
  on st.store_id = m.store_id
  and st.coffer_id = m.coffer_id
left join safe_used su
  on su.store_id = m.store_id
  and su.coffer_id = m.coffer_id
left join lateral (
  -- Inventory "non transférés" (legacy header card)
  with
    safe_by_number as (
      select
        cs.store_id,
        trim(coalesce(cs.check_number, '')) as check_number,
        sum(coalesce(cs.amount, 0))::numeric as safe_amount
      from public.check_safe cs
      where cs.check_number is not null
      group by cs.store_id, trim(coalesce(cs.check_number, ''))
    ),
    inv_by_number as (
      select
        coalesce(
          case when ci.given_to_type = 'store' then ci.given_to_id end,
          u.store_id
        ) as store_id,
        trim(coalesce(ci.check_id_number, '')) as check_number,
        sum(coalesce(ci.remaining_balance, ci.amount_value, 0))::numeric as inv_remaining
      from public.check_inventory ci
      left join public.users u on u.id = ci.created_by
      where
        coalesce(ci.transferred_to_safe, false) = false
        and lower(coalesce(ci.status, '')) not in ('used', 'archived')
        and coalesce(ci.remaining_balance, ci.amount_value, 0) > 0
        and ci.check_id_number is not null
      group by coalesce(
        case when ci.given_to_type = 'store' then ci.given_to_id end,
        u.store_id
      ), trim(coalesce(ci.check_id_number, ''))
    )
  select
    sum(greatest(0, i.inv_remaining - coalesce(s.safe_amount, 0)))::numeric as montant_non_transferes
  from inv_by_number i
  left join safe_by_number s
    on s.store_id = i.store_id
    and s.check_number = i.check_number
  where i.store_id = m.store_id
) inv on true;

comment on view public.coffer_totals_v1 is
  'Computed coffer totals. montant_cheques_transferred=SUM(check_safe.amount). montant_cheque=remaining safe checks after usages (check_safe_usages) + check movements. Non-transferred inventory is not included here.';

-- Admin view stays the same; it selects from coffer_totals_v1
create or replace view public.coffer_totals_admin_v1 as
select
  store_id,
  coffer_id,
  montant_non_transferes,
  montant_transferes,
  montant_espece,
  montant_cheque,
  montant_cheques_transferred,
  montant_mouvements_total,
  montant_virement,
  -- Backward-compatible field added in later migration
  -- (kept here so deployments that run only this migration still work)
  0::numeric as montant_cheques_utilises
from public.coffer_totals_v1

union all

select
  null::uuid as store_id,
  coffer_id,
  sum(montant_non_transferes)::numeric as montant_non_transferes,
  sum(montant_transferes)::numeric as montant_transferes,
  sum(montant_espece)::numeric as montant_espece,
  sum(montant_cheque)::numeric as montant_cheque,
  sum(montant_cheques_transferred)::numeric as montant_cheques_transferred,
  sum(montant_mouvements_total)::numeric as montant_mouvements_total,
  sum(montant_virement)::numeric as montant_virement,
  0::numeric as montant_cheques_utilises
from public.coffer_totals_v1
group by coffer_id;

comment on view public.coffer_totals_admin_v1 is
  'Admin totals (includes ALL-stores aggregate). Based on coffer_totals_v1 with safe usage ledger.';
