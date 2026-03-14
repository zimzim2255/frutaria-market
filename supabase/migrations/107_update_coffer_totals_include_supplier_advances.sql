-- Update coffer totals to account for supplier advances as an outflow.
-- Requirements:
-- - If advance payment_method='cash' => subtract from Montant (Espèce)
-- - If advance payment_method='check' => subtract from Montant (Chèque)
-- - If advance payment_method='bank_transfer' => subtract from virement bucket
-- - Also reduce total "Montant (Transférés)" because it includes all movements.

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
  ),

  -- Supplier advances are an OUTGOING movement from the coffer.
  supplier_advances_by_store_coffer as (
    select
      sa.store_id,
      sa.coffer_id,
      sum(coalesce(sa.amount, 0))::numeric as advances_total,
      sum(case when sa.payment_method = 'cash' then coalesce(sa.amount, 0) else 0 end)::numeric as advances_cash,
      sum(case when sa.payment_method = 'check' then coalesce(sa.amount, 0) else 0 end)::numeric as advances_check,
      sum(case when sa.payment_method = 'bank_transfer' then coalesce(sa.amount, 0) else 0 end)::numeric as advances_transfer
    from public.supplier_advances sa
    group by sa.store_id, sa.coffer_id
  )

select
  m.store_id,
  m.coffer_id,

  -- UI cards
  coalesce(n.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- Total transferred: checks in safe + all coffer movements (expenses) - supplier advances
  (
    coalesce(t.montant_transferred_checks, 0)
    + coalesce(m.montant_movements_total, 0)
    - coalesce(a.advances_total, 0)
  )::numeric as montant_transferes,

  -- Espèce: cash movements - cash advances
  (coalesce(m.montant_espece, 0) - coalesce(a.advances_cash, 0))::numeric as montant_espece,

  -- Chèque: transferred checks + check movements - check advances
  (
    coalesce(t.montant_transferred_checks, 0)
    + coalesce(m.montant_mouvement_cheque, 0)
    - coalesce(a.advances_check, 0)
  )::numeric as montant_cheque,

  -- helpful breakdown
  coalesce(t.montant_transferred_checks, 0)::numeric as montant_cheques_transferred,
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,
  (coalesce(m.montant_mouvement_virement, 0) - coalesce(a.advances_transfer, 0))::numeric as montant_virement

from movements_by_store_coffer m
left join non_transferred_by_store n on n.store_id = m.store_id
left join transferred_checks_by_store t on t.store_id = m.store_id
left join supplier_advances_by_store_coffer a on a.store_id = m.store_id and a.coffer_id = m.coffer_id;

comment on view public.coffer_totals_v1 is
  'Computed coffer totals (non-transferred, transferred, cash, check). Derived from expenses/check_inventory/check_safe and subtracts supplier_advances by payment method.';
