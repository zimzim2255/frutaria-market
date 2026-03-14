begin;

-- ============================================================
-- 1) AUTO-CREATE MISSING EXPENSE ROWS FOR SUPPLIER PAYMENTS
-- ============================================================

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
  'main' as coffer_id,
  -abs(p.amount)::numeric as amount,
  case
    when lower(coalesce(p.payment_method::text, '')) = 'check' then 'coffer_out_check'
    when lower(coalesce(p.payment_method::text, '')) = 'bank_transfer' then 'coffer_out_bank_transfer'
    else 'coffer_out_cash'
  end as expense_type,
  'Paiement Fournisseur (auto repair)' as reason,
  concat_ws(
    ' | ',
    coalesce(p.notes, ''),
    'supplier_payment_id=' || p.id::text,
    'supplier_id=' || coalesce(p.supplier_id::text, '-')
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

-- ============================================================
-- 2) LINK EXISTING EXPENSES THAT MATCH BUT MISS MARKER
-- ============================================================

create temporary table tmp_payment_expense_link as
with missing_marker as (
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
    e.id as expense_id
  from missing_marker p
  join public.expenses e
    on e.store_id = p.store_id
   and e.expense_type like 'coffer_out_%'
   and abs(e.amount - (-abs(p.amount))) <= 0.0001
   and e.created_at between
       (p.created_at - interval '7 days')
       and (p.created_at + interval '7 days')
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

update public.expenses e
set notes = trim(
  both ' ' from
  concat_ws(
    ' | ',
    nullif(e.notes, ''),
    'supplier_payment_id=' || t.payment_id
  )
)
from tmp_payment_expense_link t
where e.id = t.expense_id;

commit;
