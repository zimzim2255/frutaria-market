-- Add client_id to sales so edits can safely reassign sales to different clients
-- and reconcile client total balances (total_facture / remaining balances).

begin;

alter table public.sales
  add column if not exists client_id uuid;

-- FK to clients (nullable because many historic sales may not map cleanly)
-- If a client is deleted, keep the sale but null out the association.
alter table public.sales
  drop constraint if exists sales_client_id_fkey;

alter table public.sales
  add constraint sales_client_id_fkey
  foreign key (client_id)
  references public.clients(id)
  on delete set null;

create index if not exists sales_client_id_idx
  on public.sales(client_id);

commit;
