-- Preview + consume BL numbers so we don't waste numbers when user cancels.
--
-- Usage:
--  - preview_next_bl_number('global') -> returns next BL without incrementing
--  - consume_next_bl_number('global') -> increments and returns the consumed BL

begin;

-- Ensure the counter table exists (idempotent)
create table if not exists public.bl_counters (
  id text primary key,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.bl_counters (id, last_value)
values ('global', 0)
on conflict (id) do nothing;

-- Preview function (does not increment)
create or replace function public.preview_next_bl_number(counter_id text default 'global')
returns text
language plpgsql
as $$
declare
  current_val bigint;
  next_val bigint;
begin
  select last_value into current_val
  from public.bl_counters
  where id = counter_id;

  if current_val is null then
    -- initialize counter row if it doesn't exist
    insert into public.bl_counters (id, last_value)
    values (counter_id, 0)
    on conflict (id) do nothing;

    current_val := 0;
  end if;

  next_val := current_val + 1;
  return 'BL-' || lpad(next_val::text, 5, '0');
end;
$$;

-- Consume function (increments atomically)
create or replace function public.consume_next_bl_number(counter_id text default 'global')
returns text
language plpgsql
as $$
declare
  new_val bigint;
begin
  update public.bl_counters
  set last_value = last_value + 1,
      updated_at = now()
  where id = counter_id
  returning last_value into new_val;

  if new_val is null then
    -- initialize and retry once
    insert into public.bl_counters (id, last_value)
    values (counter_id, 0)
    on conflict (id) do nothing;

    update public.bl_counters
    set last_value = last_value + 1,
        updated_at = now()
    where id = counter_id
    returning last_value into new_val;
  end if;

  return 'BL-' || lpad(new_val::text, 5, '0');
end;
$$;

commit;
