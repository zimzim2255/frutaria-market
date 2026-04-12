-- Fix coffer totals: ensure rows exist even when there are no `expenses` movements.
-- Root cause: coffer_totals_v1 used movements_by_store_coffer as the FROM base,
-- which drops stores that only have check_safe/check_inventory activity.
-- This migration rebuilds coffer_totals_v1 using a base set of (store_id, coffer_id)
-- coming from ANY source: expenses, check_safe, check_inventory.

-- IMPORTANT:
-- Postgres can't "CREATE OR REPLACE" a view if it would drop/rename columns.
-- Some deployments have a different column set/order already.
-- We drop dependent views first, then recreate with the expected shape.

drop view if exists public.coffer_totals_admin_v1;
drop view if exists public.coffer_totals_v1;

create view public.coffer_totals_v1 as
with
  -- All coffer/store pairs that should be represented in the totals.
  -- Includes:
  --  - expenses movements (cash/check/virement)
  --  - check_safe (transferred checks)
  --  - check_inventory not transferred (non transférés)
  base_pairs as (
    select
      e.store_id,
      coalesce(e.coffer_id, 'main') as coffer_id
    from public.expenses e
    where e.coffer_id is not null

    union

    select
      cs.store_id,
      coalesce(cs.coffer_id, 'main') as coffer_id
    from public.check_safe cs

    union

    -- Include non-transferred inventory checks under coffer_id='main'
    -- (check_inventory does not reliably store coffer_id)
    select
      coalesce(
        case when ci.given_to_type = 'store' then ci.given_to_id end,
        u.store_id
      ) as store_id,
      'main'::text as coffer_id
    from public.check_inventory ci
    left join public.users u on u.id = ci.created_by
    where
      coalesce(ci.transferred_to_safe, false) = false
      and lower(coalesce(ci.status, '')) not in ('used', 'archived')
      and coalesce(ci.remaining_balance, ci.amount_value, 0) > 0
      and ci.check_id_number is not null
  ),

  safe_totals as (
    select
      cs.store_id,
      coalesce(cs.coffer_id, 'main') as coffer_id,
      sum(coalesce(cs.amount, 0))::numeric as transferred_total
    from public.check_safe cs
    group by cs.store_id, coalesce(cs.coffer_id, 'main')
  ),

  -- Some deployments/flows mark a check as transferred by updating check_inventory.transferred_to_safe=true
  -- without inserting into check_safe.
  -- To keep UI cards reactive, count transferred inventory here as well.
  inv_transferred_totals as (
    select
      coalesce(
        case when ci.given_to_type = 'store' then ci.given_to_id end,
        u.store_id
      ) as store_id,
      'main'::text as coffer_id,
      sum(coalesce(ci.remaining_balance, ci.amount_value, 0))::numeric as transferred_total
    from public.check_inventory ci
    left join public.users u on u.id = ci.created_by
    where
      coalesce(ci.transferred_to_safe, false) = true
      and lower(coalesce(ci.status, '')) not in ('archived')
      and coalesce(ci.remaining_balance, ci.amount_value, 0) > 0
      and ci.check_id_number is not null
    group by coalesce(
      case when ci.given_to_type = 'store' then ci.given_to_id end,
      u.store_id
    )
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
  bp.store_id,
  bp.coffer_id,

  -- Keep this card for backward compatibility.
  -- "Non transférés" reflects inventory checks not yet transferred.
  coalesce(inv.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- transferred total = transferred checks (safe + inventory flag) + all movements
  (coalesce(st.transferred_total, 0) + coalesce(it.transferred_total, 0) + coalesce(m.montant_movements_total, 0))::numeric as montant_transferes,

  -- espèce = cash movements only
  coalesce(m.montant_espece, 0)::numeric as montant_espece,

  -- chèque (AVAILABLE IN COFFRE) = remaining safe checks after usages + check movements
  (greatest(0, coalesce(st.transferred_total, 0) - coalesce(su.used_total, 0)) + coalesce(m.montant_mouvement_cheque, 0))::numeric as montant_cheque,

  -- breakdown
  coalesce(st.transferred_total, 0)::numeric as montant_cheques_transferred,
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,
  coalesce(m.montant_mouvement_virement, 0)::numeric as montant_virement

from base_pairs bp
left join movements_by_store_coffer m
  on m.store_id = bp.store_id
  and m.coffer_id = bp.coffer_id
left join safe_totals st
  on st.store_id = bp.store_id
  and st.coffer_id = bp.coffer_id
left join inv_transferred_totals it
  on it.store_id = bp.store_id
  and it.coffer_id = bp.coffer_id
left join safe_used su
  on su.store_id = bp.store_id
  and su.coffer_id = bp.coffer_id
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
  where i.store_id = bp.store_id
) inv on true

-- Ensure deterministic row uniqueness (defensive):
-- base_pairs uses UNION which should already be unique, but we keep this pattern stable
-- across potential schema changes.
;

comment on view public.coffer_totals_v1 is
  'Computed coffer totals. Fix: base_pairs ensures stores with only check activity are included. montant_cheques_transferred=SUM(check_safe.amount). montant_cheque=remaining safe checks after usages (check_safe_usages) + check movements.';

-- Keep admin view consistent (re-create as well so dependent objects get updated)
create view public.coffer_totals_admin_v1 as
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
  'Admin totals (includes ALL-stores aggregate). Based on coffer_totals_v1 (fixed base_pairs).';
