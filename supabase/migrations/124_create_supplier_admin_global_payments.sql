-- 124_create_supplier_admin_global_payments.sql
-- Purpose:
-- Fix "Paiement Global (Fournisseur Admin)" by creating a proper schema-backed table.
-- This removes reliance on parsing store_global_payments.notes and makes the feature enforceable.

CREATE TABLE IF NOT EXISTS public.supplier_admin_global_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The admin supplier (a user with role=admin)
  admin_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Paying store (magasin)
  paid_by_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  -- The store_global_payments row that represents the outgoing money movement.
  -- Nullable to allow remise-only operations.
  store_global_payment_id UUID REFERENCES public.store_global_payments(id) ON DELETE SET NULL,

  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  reference_number TEXT,
  notes TEXT,

  -- Multi-cheque support
  check_inventory_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT
);

-- Constraints
ALTER TABLE public.supplier_admin_global_payments
  ADD CONSTRAINT supplier_admin_global_payments_amount_non_negative
  CHECK (amount >= 0);

ALTER TABLE public.supplier_admin_global_payments
  ADD CONSTRAINT supplier_admin_global_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'check', 'bank_transfer'));

-- 1:1 link (optional) between supplier-admin payment and store_global_payment
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_admin_global_payments_store_gp_id
  ON public.supplier_admin_global_payments(store_global_payment_id)
  WHERE store_global_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_admin_user_id
  ON public.supplier_admin_global_payments(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_paid_by_store_id
  ON public.supplier_admin_global_payments(paid_by_store_id);

CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_payment_date
  ON public.supplier_admin_global_payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_supplier_admin_gp_reference
  ON public.supplier_admin_global_payments(reference_number);

-- RLS
ALTER TABLE public.supplier_admin_global_payments ENABLE ROW LEVEL SECURITY;

-- Admin can see all. Non-admin can see rows from their store.
CREATE POLICY "Users can view supplier admin global payments"
  ON public.supplier_admin_global_payments FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert supplier admin global payments"
  ON public.supplier_admin_global_payments FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update supplier admin global payments"
  ON public.supplier_admin_global_payments FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete supplier admin global payments"
  ON public.supplier_admin_global_payments FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_admin_global_payments TO authenticated;

COMMENT ON TABLE public.supplier_admin_global_payments IS 'Schema-backed payments for Paiement Global (Fournisseur Admin). Avoids parsing store_global_payments.notes.';
COMMENT ON COLUMN public.supplier_admin_global_payments.store_global_payment_id IS 'Optional 1:1 link to store_global_payments movement. Null for remise-only entries.';
COMMENT ON COLUMN public.supplier_admin_global_payments.check_inventory_ids IS 'List of check_inventory ids used for this payment (multi-cheque).';
