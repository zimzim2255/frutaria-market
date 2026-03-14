-- Full fix for Coffre totals alignment:
-- Goal: make header cards consistent with the cheque table counts and amounts.
-- Problems seen in v1:
--  - double-counting transfers (check_safe + check_inventory.transferred_to_safe)
--  - relying on check numbers matching between inventory and safe
--  - using movements_by_store_coffer as the only source for existence
--  - inconsistent semantics between "Montant (Transférés)" and "Montant (Chèque - Transférés)"
--
-- New rules (v2):
-- 1) "Non transférés" amount = SUM(check_inventory remaining/amount) WHERE transferred_to_safe=false
-- 2) "Chèque - Transférés" amount = SUM(check_inventory remaining/amount) WHERE transferred_to_safe=true
--    (this matches the UI table rows that show status "Transféré")
-- 3) "Montant (Transférés)" = espèce + virement + (Chèque - Transférés)
--    (keeps the cards additive and prevents double-counting)
-- 4) "Montant (Chèque - Disponible)" = check_safe total - check_safe_usages total
-- 5) base_pairs exists if there is ANY activity (expenses or any check_inventory row or check_safe row)
--
-- This is a view-only fix; it does not change data.

-- Drop dependents first to avoid "cannot drop columns from view".
drop view if exists public.coffer_totals_admin_v1 cascade;
drop view if exists public.coffer_totals_v1 cascade;

create view public.coffer_totals_v1 as
with
  base_pairs as (
    -- Activity from expenses
    select e.store_id, coalesce(e.coffer_id, 'main') as coffer_id
    from public.expenses e
    where e.coffer_id is not null

    union

    -- Activity from safe
    select cs.store_id, coalesce(cs.coffer_id, 'main') as coffer_id
    from public.check_safe cs

    union

    -- Activity from inventory (always treated as coffer_id='main')
    select
      coalesce(
        case when ci.given_to_type = 'store' then ci.given_to_id end,
        u.store_id
      ) as store_id,
      'main'::text as coffer_id
    from public.check_inventory ci
    left join public.users u on u.id = ci.created_by
    where ci.check_id_number is not null
  ),

  movements as (
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
            or lower(coalesce(e.expense_type, '')) = 'coffer_expense'
          then coalesce(e.amount, 0)
          else 0
        end
      )::numeric as montant_espece,

      sum(
        case
          when lower(coalesce(e.expense_type, '')) = 'coffer_deposit_bank_transfer'
            or lower(coalesce(e.expense_type, '')) like '%bank_transfer%'
            or lower(coalesce(e.expense_type, '')) like '%transfer%'
            or lower(coalesce(e.expense_type, '')) like '%virement%'
          then coalesce(e.amount, 0)
          else 0
        end
      )::numeric as montant_virement
    from public.expenses e
    where e.coffer_id is not null
    group by e.store_id, coalesce(e.coffer_id, 'main')
  ),

  inv_totals as (
    -- IMPORTANT:
    -- Amounts must match the cheque table.
    -- In UI, "Montant" is the cheque face value.
    -- We must NOT blindly prefer remaining_balance, because it can contain unrelated balances
    -- and would inflate totals.
    --
    -- Rule:
    -- - status=partial => use remaining_balance (what is still available)
    -- - otherwise      => use amount_value
    select
      coalesce(
        case when ci.given_to_type = 'store' then ci.given_to_id end,
        u.store_id
      ) as store_id,
      'main'::text as coffer_id,
      sum(
        case
          when coalesce(ci.transferred_to_safe, false) = false then
            case
              when lower(coalesce(ci.status, '')) = 'partial' then coalesce(ci.remaining_balance, 0)
              else coalesce(ci.amount_value, 0)
            end
          else 0
        end
      )::numeric as montant_non_transferes,

      sum(
        case
          when coalesce(ci.transferred_to_safe, false) = true then
            case
              when lower(coalesce(ci.status, '')) = 'partial' then coalesce(ci.remaining_balance, 0)
              else coalesce(ci.amount_value, 0)
            end
          else 0
        end
      )::numeric as montant_cheques_transferred
    from public.check_inventory ci
    left join public.users u on u.id = ci.created_by
    where
      ci.check_id_number is not null
      and lower(coalesce(ci.status, '')) not in ('archived')
      and (
        (lower(coalesce(ci.status, '')) = 'partial' and coalesce(ci.remaining_balance, 0) > 0)
        or (lower(coalesce(ci.status, '')) <> 'partial' and coalesce(ci.amount_value, 0) > 0)
      )
    group by coalesce(
      case when ci.given_to_type = 'store' then ci.given_to_id end,
      u.store_id
    )
  ),

  safe_totals as (
    select
      cs.store_id,
      coalesce(cs.coffer_id, 'main') as coffer_id,
      sum(coalesce(cs.amount, 0))::numeric as safe_total
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

  cheque_used_totals as (
    -- "Montant (Chèque - Utilisés)" should reflect checks that were consumed (used)
    -- based on the safe usage ledger.
    select
      u.store_id,
      coalesce(u.coffer_id, 'main') as coffer_id,
      sum(coalesce(u.amount_used, 0))::numeric as montant_cheques_utilises
    from public.check_safe_usages u
    group by u.store_id, coalesce(u.coffer_id, 'main')
  )

select
  bp.store_id,
  bp.coffer_id,

  coalesce(inv.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- "Montant (Transférés)" includes ONLY:
  --  - cash movements
  --  - bank transfer movements
  --  - cheques that were transferred in inventory
  (coalesce(m.montant_espece, 0) + coalesce(m.montant_virement, 0) + coalesce(inv.montant_cheques_transferred, 0))::numeric as montant_transferes,

  coalesce(m.montant_espece, 0)::numeric as montant_espece,

  -- "Montant (Chèque)" is what's available in the safe to be used for payments
  greatest(0, coalesce(st.safe_total, 0) - coalesce(su.used_total, 0))::numeric as montant_cheque,

  -- "Montant (Chèque - Transférés)" should match transferred inventory
  coalesce(inv.montant_cheques_transferred, 0)::numeric as montant_cheques_transferred,

  -- total movements (legacy)
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,

  coalesce(m.montant_virement, 0)::numeric as montant_virement,

  -- "Montant (Chèque - Utilisés)" = sum of cheque usage ledger
  coalesce(cu.montant_cheques_utilises, 0)::numeric as montant_cheques_utilises

from base_pairs bp
left join movements m
  on m.store_id = bp.store_id and m.coffer_id = bp.coffer_id
left join inv_totals inv
  on inv.store_id = bp.store_id and inv.coffer_id = bp.coffer_id
left join safe_totals st
  on st.store_id = bp.store_id and st.coffer_id = bp.coffer_id
left join safe_used su
  on su.store_id = bp.store_id and su.coffer_id = bp.coffer_id
left join cheque_used_totals cu
  on cu.store_id = bp.store_id and cu.coffer_id = bp.coffer_id;

comment on view public.coffer_totals_v1 is
  'Coffer totals v2: aligned with cheque table. Non-transferred & transferred come from check_inventory flags; safe (check_safe) drives available cheque amount.';

-- Admin view with ALL-stores aggregate
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
  montant_cheques_utilises
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
  sum(montant_cheques_utilises)::numeric as montant_cheques_utilises
from public.coffer_totals_v1
group by coffer_id;

comment on view public.coffer_totals_admin_v1 is
  'Admin totals v2 (includes ALL-stores aggregate).';
