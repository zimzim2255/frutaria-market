-- Add montant_cheques_utilises to coffer totals views so the UI can display
-- "Montant (Chèque - Utilisés)" fully backend-driven.
--
-- This is derived from the check usage ledger created in migration 110:
--   public.check_safe_usages
--
-- Important:
-- - "Transférés" (montant_cheques_transferred) is historical SUM(check_safe.amount)
-- - "Disponible" (montant_cheque) is remaining in safe after usages + any cheque movements
-- - "Utilisés" (montant_cheques_utilises) is SUM(check_safe_usages.amount_used)

create or replace view public.coffer_totals_v1 as
with
  safe_totals as (
    -- Only checks that are actually in the safe count as "transferred" money.
    -- Some deployments use mixed status values, so we treat these as in-safe/usable:
    --   in_safe, confirmed
    -- and we exclude fully moved out statuses like transferred (to bank).
    select
      cs.store_id,
      coalesce(cs.coffer_id, 'main') as coffer_id,
      sum(coalesce(cs.amount, 0))::numeric as transferred_total
    from public.check_safe cs
    where lower(coalesce(cs.status, '')) in ('in_safe', 'confirmed')
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
  coalesce(inv.montant_non_transferes, 0)::numeric as montant_non_transferes,

  -- transferred total = safe transferred checks + all movements
  (coalesce(st.transferred_total, 0) + coalesce(m.montant_movements_total, 0))::numeric as montant_transferes,

  -- espèce = cash movements only
  coalesce(m.montant_espece, 0)::numeric as montant_espece,

  -- chèque bucket inside coffre safe (backend source-of-truth):
  -- - Transférés  = SUM(check_safe.amount)
  -- - Utilisés    = SUM(check_safe_usages.amount_used)
  -- - Disponible  = Transférés - Utilisés
  -- NOTE: do NOT mix expenses "cheque movements" here, otherwise Disponible can exceed Transférés.
  greatest(
    0,
    coalesce(st.transferred_total, 0) - greatest(0, coalesce(su.used_total, 0))
  )::numeric as montant_cheque,

  -- breakdown
  coalesce(st.transferred_total, 0)::numeric as montant_cheques_transferred,
  coalesce(m.montant_movements_total, 0)::numeric as montant_mouvements_total,
  coalesce(m.montant_mouvement_virement, 0)::numeric as montant_virement,

  -- NEW (append at the end to avoid implicit column rename errors)
  greatest(0, coalesce(su.used_total, 0))::numeric as montant_cheques_utilises

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
  'Computed coffer totals. montant_cheques_transferred=SUM(check_safe.amount). montant_cheque=remaining safe checks after usages (check_safe_usages) + check movements. montant_cheques_utilises=SUM(check_safe_usages.amount_used).';

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
  sum(montant_cheques_utilises)::numeric as montant_cheques_utilises,
  sum(montant_mouvements_total)::numeric as montant_mouvements_total,
  sum(montant_virement)::numeric as montant_virement
from public.coffer_totals_v1
group by coffer_id;

comment on view public.coffer_totals_admin_v1 is
  'Admin totals (includes ALL-stores aggregate). Based on coffer_totals_v1 with safe usage ledger.';
