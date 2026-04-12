-- 118_create_admin_supplier_invoices.sql
-- Purpose:
-- Persist "Fournisseur Admin" invoice events so that:
-- - Debt appears in Fournisseur Admin (Total Facture) using the same accrual mechanism
-- - Products can be associated to a supplier row so SupplierDetailsPage shows them
-- - We can group products by stock_reference under the correct admin supplier in details
--
-- Strategy:
-- 1) Create a small table to record admin-supplier invoice metadata
-- 2) Link it to a sales row (TRANSFER) as source of truth for debt
-- 3) Link it to stock_reference so details can show product groups

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  stock_reference text NULL,
  sale_id uuid NULL REFERENCES public.sales(id) ON DELETE SET NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_supplier_invoices_admin_user_id_idx
  ON public.admin_supplier_invoices (admin_user_id);

CREATE INDEX IF NOT EXISTS admin_supplier_invoices_store_id_idx
  ON public.admin_supplier_invoices (store_id);

CREATE INDEX IF NOT EXISTS admin_supplier_invoices_stock_reference_idx
  ON public.admin_supplier_invoices (stock_reference);

COMMIT;
