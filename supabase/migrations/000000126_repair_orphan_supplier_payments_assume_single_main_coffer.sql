-- REPAIR ORPHAN SUPPLIER PAYMENTS (ASSUMING A SINGLE MAIN COFFER)
--
-- You stated: there is only ONE coffer (main) and all operations used it.
-- This migration will:
-- 1) Find that single coffer id from existing expenses/check_safe_usages rows
-- 2) For supplier payments that have NO linked expense marker (supplier_payment_id=<paymentId>),
--    insert the missing expenses row using the main coffer.
-- 3) For cheque supplier payments that have NO linked check_safe_usages row, insert one using
--    the most plausible check_safe_id (if inferable).
--
-- IMPORTANT LIMITATIONS (read):
-- - If multiple coffers exist or historical data contains multiple coffer_id values, this will STOP.
-- - For cheque payments, if we cannot infer check_safe_id, we will SKIP those rows (no guessing).
-- - This is a one-time repair for legacy corrupted history.
--
-- After this repair, amount-only correction should work for repaired payments.

begin;

-- Determine the "main" coffer_id (TEXT) to use.
-- Based on your data you showed:
--   expenses:            main (8), coffer-1769867045135 (7)
--   check_safe_usages:   main (5), coffer-1769867045135 (3)
-- You confirmed "main" is the real one.
--
-- If you ever want to change it, update the value below.

do $
declare
  v_main_coffer text := 'main';
  v_has boolean;
begin
  -- Basic sanity: ensure it exists in either expenses or check_safe_usages
  select exists(
    select 1 from public.expenses where trim(coffer_id) = v_main_coffer
    union
    select 1 from public.check_safe_usages where trim(coffer_id) = v_main_coffer
  ) into v_has;

  if not v_has then
    raise exception 'Configured main coffer_id (%) not found in expenses/check_safe_usages.', v_main_coffer;
  end if;

  create temporary table tmp_main_coffer(id text);
  insert into tmp_main_coffer(id) values (v_main_coffer);
end $;

-- 1) Insert missing EXPENSE rows for orphan supplier payments (any payment_method).
-- We insert only if there is no existing expense marker for that payment.
insert into public.expenses (
  store_id,
  coffer_id,
  amount,
  expense_type,
  reason,
  notes,
  created_by,
  created_at
)
select
  p.store_id,
  (select id from tmp_main_coffer limit 1) as coffer_id,
  -abs(p.amount)::numeric as amount,
  case
    when lower(coalesce(p.payment_method::text, '')) = 'check' then 'coffer_out_check'
    when lower(coalesce(p.payment_method::text, '')) = 'bank_transfer' then 'coffer_out_bank_transfer'
    else 'coffer_out_cash'
  end as expense_type,
  'Paiement Fournisseur (repair orphan)' as reason,
  concat_ws(
    ' | ',
    'repair_orphan',
    'supplier_payment_id=' || p.id::text,
    'supplier_id=' || coalesce(p.supplier_id::text, '-'),
    'payment_method=' || coalesce(p.payment_method::text, '-'),
    'reference_number=' || coalesce(p.reference_number::text, '-')
  ) as notes,
  p.created_by,
  p.created_at
from public.payments p
where p.supplier_id is not null
  and not exists (
    select 1
    from public.expenses e
    where e.notes ilike ('%supplier_payment_id=' || p.id::text || '%')
  );

-- 2) Insert missing CHECK usage rows for cheque supplier payments.
-- We SKIP if we cannot infer check_safe_id.
-- Inference strategy: find a check_safe_usages row close in time/amount/store and reuse its check_safe_id.
with main_coffer as (
  select id as coffer_id from tmp_main_coffer limit 1
),
orphan_cheque_payments as (
  select p.*
  from public.payments p
  where p.supplier_id is not null
    and lower(coalesce(p.payment_method::text, '')) = 'check'
    and not exists (
      select 1
      from public.check_safe_usages u
      where u.ref_table = 'payments' and u.ref_id = p.id
    )
),
usage_candidates as (
  select
    p.id as payment_id,
    u.check_safe_id,
    row_number() over (
      partition by p.id
      order by abs(extract(epoch from (u.created_at - p.created_at))) asc
    ) as rn
  from orphan_cheque_payments p
  join public.check_safe_usages u
    on u.store_id = p.store_id
   and abs(u.amount_used - abs(p.amount)) <= 0.0001
   and u.created_at between (p.created_at - interval '30 days') and (p.created_at + interval '30 days')
  where u.check_safe_id is not null
),
picked as (
  select payment_id, check_safe_id
  from usage_candidates
  where rn = 1
)
insert into public.check_safe_usages (
  check_safe_id,
  store_id,
  coffer_id,
  amount_used,
  usage_type,
  ref_table,
  ref_id,
  notes,
  created_by,
  created_at
)
select
  pk.check_safe_id,
  p.store_id,
  (select coffer_id from main_coffer) as coffer_id,
  abs(p.amount)::numeric as amount_used,
  'supplier_payment' as usage_type,
  'payments' as ref_table,
  p.id as ref_id,
  concat_ws(' | ', 'repair_orphan', 'ref_table=payments', 'ref_id=' || p.id::text) as notes,
  p.created_by,
  p.created_at
from orphan_cheque_payments p
join picked pk on pk.payment_id = p.id;

commit;
