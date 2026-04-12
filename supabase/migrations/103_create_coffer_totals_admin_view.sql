-- Admin-friendly totals view
-- Computes totals per store_id+coffer_id, and also provides an ALL-STORES aggregate.
--
-- Motivation:
-- - Admin should be able to see totals across all magasins without selecting a store.
-- - Non-admin users remain store-scoped via API enforcement.

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
  montant_virement
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
  sum(montant_virement)::numeric as montant_virement
from public.coffer_totals_v1
group by coffer_id;

comment on view public.coffer_totals_admin_v1 is
  'Coffer totals including an ALL-stores aggregate row (store_id NULL) for admin overview. Based on coffer_totals_v1.';
