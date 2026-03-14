-- 125_perf_indexes_and_fast_rpc.sql
-- Purpose: Improve perceived performance across the app with minimal frontend changes.
-- Strategy:
-- 1) Add indexes for the most common WHERE + ORDER BY patterns.
-- 2) Add lightweight RPCs to return consolidated totals quickly (optional use).
-- Notes:
-- - All indexes are created IF NOT EXISTS to be safe.
-- - Supabase migrations run in a transaction, so we avoid CONCURRENTLY here.

-- ============
-- Core list pages (by date / store)
-- ============

-- store_global_payments: common filters
CREATE INDEX IF NOT EXISTS idx_store_global_payments_paid_by_store_date
  ON public.store_global_payments (paid_by_store_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_store_date
  ON public.store_global_payments (store_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_method_date
  ON public.store_global_payments (payment_method, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_reference
  ON public.store_global_payments (reference_number);

-- check_inventory: coffer filtering + status filtering
-- Note: this assumes check_inventory.coffer_id exists in your current schema.
CREATE INDEX IF NOT EXISTS idx_check_inventory_coffer_status
  ON public.check_inventory (coffer_id, status);

-- sales: frequent listing by store and time
CREATE INDEX IF NOT EXISTS idx_sales_store_created_at
  ON public.sales (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_source_store_created_at
  ON public.sales (source_store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_sale_number
  ON public.sales (sale_number);

-- invoices: common sort/filter
CREATE INDEX IF NOT EXISTS idx_invoices_store_created_at
  ON public.invoices (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number
  ON public.invoices (invoice_number);

-- products: common store/category/reference filters
CREATE INDEX IF NOT EXISTS idx_products_store_created_at
  ON public.products (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_stock_reference
  ON public.products (stock_reference);

CREATE INDEX IF NOT EXISTS idx_products_reference
  ON public.products (reference);

-- store_stocks: used to filter product visibility
CREATE INDEX IF NOT EXISTS idx_store_stocks_store_product
  ON public.store_stocks (store_id, product_id);

-- discounts: for remise lookups
CREATE INDEX IF NOT EXISTS idx_discounts_ref_table_ref_id
  ON public.discounts (ref_table, ref_id);

-- admin supplier invoices: faster listing
CREATE INDEX IF NOT EXISTS idx_admin_supplier_invoices_store_created
  ON public.admin_supplier_invoices (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_supplier_invoices_admin_created
  ON public.admin_supplier_invoices (admin_user_id, created_at DESC);

-- supplier_admin_global_payments: extra helpful composite indexes
CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_store_date
  ON public.supplier_admin_global_payments (paid_by_store_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_admin_date
  ON public.supplier_admin_global_payments (admin_user_id, payment_date DESC);


-- ============
-- Lightweight RPCs (optional)
-- ============

-- Fast totals for a magasin for a date range (payments only)
CREATE OR REPLACE FUNCTION public.fast_store_global_payments_sum(
  p_store_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0)::numeric
  FROM public.store_global_payments gp
  WHERE gp.paid_by_store_id = p_store_id
    AND (p_date_from IS NULL OR gp.payment_date >= p_date_from)
    AND (p_date_to IS NULL OR gp.payment_date <= p_date_to);
$$;

GRANT EXECUTE ON FUNCTION public.fast_store_global_payments_sum(uuid, timestamptz, timestamptz) TO authenticated;

-- Fast totals for cheques currently inside a specific coffer
CREATE OR REPLACE FUNCTION public.fast_check_inventory_coffer_sum(
  p_coffer_id text
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(COALESCE(amount_value, 0)), 0)::numeric
  FROM public.check_inventory ci
  WHERE ci.coffer_id = p_coffer_id;
$$;

GRANT EXECUTE ON FUNCTION public.fast_check_inventory_coffer_sum(text) TO authenticated;
