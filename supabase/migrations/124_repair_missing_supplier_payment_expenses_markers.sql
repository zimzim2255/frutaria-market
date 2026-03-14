-- Repair historic supplier payments that are missing a traceable Coffre movement marker.
--
-- Problem:
-- Some old rows exist in public.payments but the matching public.expenses row is missing
-- OR does not contain the marker: supplier_payment_id=<paymentId>
--
-- The correction endpoint (/payments/:id/correct) relies on that marker to resolve coffer_id.
-- This migration tries to repair history for ALL affected payments by linking an existing
-- expense row to each payment (by updating its notes).
--
-- Safety rules:
-- - We DO NOT create new expense rows here (because coffer_id cannot be guessed safely in general)
-- - We only update notes when we can find EXACTLY ONE matching candidate expense row
-- - We never touch rows that already have the marker
-- - We only consider supplier payments that look like global supplier payments:
--   payments.supplier_id is not null
-- - We only consider expenses that look like supplier payment outflows:
--   expenses.expense_type LIKE 'coffer_out_%'
--   and expenses.amount equals -abs(payment.amount) (with small tolerance)
--
-- After running, amount-only correction should work for those repaired payments.

begin;

-- Create a temp table of candidate links (payment_id -> expense_id)
create temporary table tmp_payment_expense_link as
with missing_marker_payments as (
  select p.*
  from public.payments p
  where p.supplier_id is not null
    and not exists (
      select 1
      from public.expenses e
      where e.notes ilike ('%supplier_payment_id=' || p.id::text || '%')
    )
),
possible_matches as (
  select
    p.id as payment_id,
    e.id as expense_id,
    p.store_id,
    p.created_at as payment_created_at,
    e.created_at as expense_created_at,
    p.amount as payment_amount,
    e.amount as expense_amount,
    e.expense_type,
    e.notes
  from missing_marker_payments p
  join public.expenses e
    on e.store_id = p.store_id
   and e.expense_type like 'coffer_out_%'
   and abs(e.amount - (-abs(p.amount))) <= 0.0001
   and e.created_at between (p.created_at - interval '7 days') and (p.created_at + interval '7 days')
   -- don't link already repaired/correction rows
   and coalesce(e.notes, '') not ilike '%supplier_payment_reversal%'
   and coalesce(e.notes, '') not ilike '%supplier_payment_correction%'
   and coalesce(e.notes, '') not ilike '%supplier_payment_id=%'
)
select pm.payment_id, pm.expense_id
from possible_matches pm
join (
  select payment_id, count(*) as cnt
  from possible_matches
  group by payment_id
) c on c.payment_id = pm.payment_id
where c.cnt = 1;

-- Update notes for matched expenses (attach the marker)
update public.expenses e
set notes = trim(both ' ' from concat_ws(' | ', nullif(e.notes, ''), concat('supplier_payment_id=', t.payment_id)))
from tmp_payment_expense_link t
where e.id = t.expense_id;

-- Optional: For cheque payments, ensure check_safe_usages rows are also linked (ref_table/ref_id)
-- This migration does NOT attempt to create missing check_safe_usages.

commit;
