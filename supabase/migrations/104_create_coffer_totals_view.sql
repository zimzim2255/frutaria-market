-- Create a computed (source-of-truth) view for Coffre header totals
-- These totals are derived from raw operations tables (expenses, check_inventory, check_safe).
--
-- Why a VIEW?
-- - Avoid storing “header totals” as mutable rows (race conditions, multi-user overwrites).
-- - Always correct even when historical rows are edited/deleted.
-- - Frontend can poll this view every 5s for “live” updates.
--
-- Returned totals match the UI cards:
-- - montant_non_transferes: remaining check inventory that is not yet transferred to safe
-- - montant_transferes: transferred checks (safe) + manual coffer movements
-- - montant_espece: cash movements only (from expenses)
-- - montant_cheque: transferred checks + check movements
--
-- Notes / assumptions based on current app implementation:
-- - Manual coffer movements are stored in public.expenses with a coffer_id.
-- - Deposits encode method via expense_type:
--     coffer_deposit_cash | coffer_deposit_check | coffer_deposit_bank_transfer
-- - Coffer expenses/outflows can exist and should reduce totals when stored as negative amounts.
--   (We sum amounts as-is: positive increases, negative decreases.)
-- - check_safe table may or may not have coffer_id in some DBs; we group checks by store_id only.
-- - For inventory “non transférés”, we subtract any amount already present in check_safe for the same check number.

create or replace view public.coffer_totals_v1 as
with
  -- Safe amounts grouped by store + check_number (to avoid double-count in inventory)
  safe_by_number as (
    select
      cs.store_id,
      trim(coalesce(cs.check_number, '')) as check_number,
      sum(coalesce(cs.amount, 0))::numeric as safe_amount
    from public.check_safe cs
    where cs.check_number is not null
    group by cs.store_id, trim(coalesce(cs.check_number, ''))
  ),

  -- Inventory remaining amounts grouped by store + check_number
  inv_by_number as (
    select
      -- check_inventory does not always have store_id; derive store scope from:
      -- 1) given_to_type='store' => given_to_id is the store
      -- 2) otherwise => the creator/uploaded_by user's store_id
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
  ),

  -- Compute non-transferred inventory after subtracting what is already in safe for same number
  non_transferred_by_store as (
    select
      i.store_id,
      sum(greatest(0, i.inv_remaining - coalesce(s.safe_amount, 0)))::numeric as montant_non_transferes
    from inv_by_number i
    left join safe_by_number s
      on s.store_id = i.store_id
      and s.check_number = i.check_number
    group by i.store_id
  ),

  -- Transferred checks in safe per store
  transferred_checks_by_store as (
    select
      cs.store_id,
      sum(coalesce(cs.amount, 0))::numeric as montant_transferred_checks
    from public.check_safe cs
    group by cs.store_id
  ),

  -- Manual coffer movements from expenses (per store + coffer_id)
  movements_by_store_coffer as (
    select
      e.store_id,
      coalesce(e.coffer_id, 'main') as coffer_id,
      sum(coalesce(e.amount, 0))::numeric as montant_movements_total,

      -- Be tolerant: derive method from expense_type keywords (matches frontend logic)
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

  -- UI cards
  coalesce(n.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- transferred total = transferred checks + all movements (cash/check/virement/expenses) for this coffer
  (coalesce(t.montant_transferred_checks, 0) + coalesce(m.montant_movements_total, 0))::numeric as montant_transferes,

  -- espèce = cash movements only
  coalesce(m.montant_espece, 0)::numeric as montant_espece,

  -- chèque = transferred checks + check movements only
  (coalesce(t.montant_transferred_checks, 0) + coalesce(m.montant_mouvement_cheque, 0))::numeric as montant_cheque,

  -- helpful breakdown
  coalesce(t.montant_transferred_checks, 0)::numeric as montant_cheques_transferred,
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,
  coalesce(m.montant_mouvement_virement, 0)::numeric as montant_virement

from movements_by_store_coffer m
left join non_transferred_by_store n on n.store_id = m.store_id
left join transferred_checks_by_store t on t.store_id = m.store_id;

comment on view public.coffer_totals_v1 is
  'Computed coffer totals (non-transferred, transferred, cash, check). Source-of-truth derived from expenses/check_inventory/check_safe. Grouped by store_id + coffer_id.';
