-- Provide a single, correct ALL-stores totals row per coffer, including store_id IS NULL rows.
--
-- Motivation:
-- - Some coffer movements were created by admin with store_id NULL.
-- - Admin needs to see them in the global (ALL magasins) totals.
-- - We keep per-store totals based on store_id as before.
-- - For ALL-stores totals, we want: SUM(per-store totals) + SUM(NULL-store movements).
--
-- This RPC returns the 4 header amounts plus helpful breakdowns.

create or replace function public.get_coffer_totals_admin_all(p_coffer_id text default 'main')
returns table (
  store_id uuid,
  coffer_id text,
  montant_non_transferes numeric,
  montant_transferes numeric,
  montant_espece numeric,
  montant_cheque numeric,
  montant_cheques_transferred numeric,
  montant_mouvements_total numeric,
  montant_virement numeric
)
language sql
stable
as $$
  with per_store as (
    select
      coffer_id,
      sum(coalesce(montant_non_transferes, 0))::numeric as montant_non_transferes,
      sum(coalesce(montant_transferes, 0))::numeric as montant_transferes,
      sum(coalesce(montant_espece, 0))::numeric as montant_espece,
      sum(coalesce(montant_cheque, 0))::numeric as montant_cheque,
      sum(coalesce(montant_cheques_transferred, 0))::numeric as montant_cheques_transferred,
      sum(coalesce(montant_mouvements_total, 0))::numeric as montant_mouvements_total,
      sum(coalesce(montant_virement, 0))::numeric as montant_virement
    from public.coffer_totals_v1
    where coffer_id = p_coffer_id
      and store_id is not null
    group by coffer_id
  ),
  null_store_movements as (
    select
      coalesce(e.coffer_id, 'main') as coffer_id,
      sum(coalesce(e.amount, 0))::numeric as montant_mouvements_total,
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
      )::numeric as montant_virement
    from public.expenses e
    where e.store_id is null
      and e.coffer_id = p_coffer_id
    group by coalesce(e.coffer_id, 'main')
  )
  select
    null::uuid as store_id,
    p_coffer_id as coffer_id,
    coalesce(ps.montant_non_transferes, 0) as montant_non_transferes,
    -- transferred = per-store transferred + NULL-store movements
    (coalesce(ps.montant_transferes, 0) + coalesce(nsm.montant_mouvements_total, 0)) as montant_transferes,
    (coalesce(ps.montant_espece, 0) + coalesce(nsm.montant_espece, 0)) as montant_espece,
    (coalesce(ps.montant_cheque, 0) + coalesce(nsm.montant_mouvement_cheque, 0)) as montant_cheque,
    coalesce(ps.montant_cheques_transferred, 0) as montant_cheques_transferred,
    (coalesce(ps.montant_mouvements_total, 0) + coalesce(nsm.montant_mouvements_total, 0)) as montant_mouvements_total,
    (coalesce(ps.montant_virement, 0) + coalesce(nsm.montant_virement, 0)) as montant_virement
  from per_store ps
  full join null_store_movements nsm
    on nsm.coffer_id = ps.coffer_id;
$$;

comment on function public.get_coffer_totals_admin_all(text) is
  'Returns ALL-stores coffer totals for admin, including movements saved with store_id NULL. Uses coffer_totals_v1 for per-store totals and sums NULL-store expenses separately.';
