-- 114_create_store_global_payments_table.sql
-- Purpose:
-- - Record global payments made to/from a magasin (store) in an auditable way
-- - Used to reconcile inter-magasins debt:
--   * What WE owe the other store comes from transfers (📦 Créer un Transfert)
--   * What the other store owes US comes from purchases (🛒 Créer un Achat)
-- - Payment entry should behave like client global payments, but for stores

CREATE TABLE IF NOT EXISTS public.store_global_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The counterparty store (magasin) this payment is for
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  -- Amount of payment (>= 0)
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- cash | check | bank_transfer
  payment_method TEXT NOT NULL,

  payment_date TIMESTAMPTZ NOT NULL DEFAULT now(),

  reference_number TEXT,
  notes TEXT,

  -- Link to the paying store/caisse context
  paid_by_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  paid_by_store_name TEXT,

  -- Audit fields (similar to client_global_payments)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,

  is_admin_payment BOOLEAN NOT NULL DEFAULT FALSE,
  acted_as_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL
);

-- Constraints
ALTER TABLE public.store_global_payments
  ADD CONSTRAINT store_global_payments_amount_non_negative
  CHECK (amount >= 0);

ALTER TABLE public.store_global_payments
  ADD CONSTRAINT store_global_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'check', 'bank_transfer'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_global_payments_store_id
  ON public.store_global_payments(store_id);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_paid_by_store_id
  ON public.store_global_payments(paid_by_store_id);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_payment_date
  ON public.store_global_payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_created_at
  ON public.store_global_payments(created_at);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_reference_number
  ON public.store_global_payments(reference_number);

CREATE INDEX IF NOT EXISTS idx_store_global_payments_acted_as_store_id
  ON public.store_global_payments(acted_as_store_id);

-- RLS
ALTER TABLE public.store_global_payments ENABLE ROW LEVEL SECURITY;

-- Similar to client_global_payments policies:
-- - Admin: can view all
-- - Non-admin: can view only rows where paid_by_store_id = their store_id
CREATE POLICY "Users can view store global payments from their store"
  ON public.store_global_payments FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id
        FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert store global payments for their store"
  ON public.store_global_payments FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id
        FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update their store global payments"
  ON public.store_global_payments FOR UPDATE
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id
        FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete their store global payments"
  ON public.store_global_payments FOR DELETE
  USING (
    auth.role() = 'authenticated'
    AND (
      EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
      )
      OR paid_by_store_id = (
        SELECT u.store_id
        FROM public.users u
        WHERE u.id = auth.uid()
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_global_payments TO authenticated;
