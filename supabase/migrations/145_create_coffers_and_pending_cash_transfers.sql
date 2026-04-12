-- ============================================
-- COFFERS CATALOG + PENDING CASH -> COFFER TRANSFERS (ADMIN CONFIRMATION)
-- ============================================
-- Goal:
--   Support selecting a coffer (not always 'main') for cash operations that must be
--   HELD until an admin confirms the transfer.
--
-- Notes:
--   - This migration is additive and does not change existing coffer totals logic.
--   - Coffers are identified by TEXT ids across this codebase (ex: 'main').

-- 1) Coffers catalog (admin-managed)
CREATE TABLE IF NOT EXISTS public.coffers (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure default coffer always exists
INSERT INTO public.coffers (id, name)
VALUES ('main', 'Coffre principal')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_coffers_active ON public.coffers(is_active);

COMMENT ON TABLE public.coffers IS 'Catalog of coffers (TEXT ids). Admin-managed. Default: main.';
COMMENT ON COLUMN public.coffers.id IS 'Coffer identifier used across the app (e.g., main)';
COMMENT ON COLUMN public.coffers.name IS 'Display name for the coffer';

-- 2) Pending cash transfers to coffer (hold -> confirm)
--    This is intentionally generic so it can be reused by different modules.
CREATE TABLE IF NOT EXISTS public.pending_coffer_transfers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  target_coffer_id text NOT NULL REFERENCES public.coffers(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount > 0),
  reference_number text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected')),
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  confirmed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamp with time zone NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_coffer_transfers_store_status
  ON public.pending_coffer_transfers(store_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_coffer_transfers_created_at
  ON public.pending_coffer_transfers(created_at);

CREATE INDEX IF NOT EXISTS idx_pending_coffer_transfers_target_coffer
  ON public.pending_coffer_transfers(target_coffer_id);

COMMENT ON TABLE public.pending_coffer_transfers IS 'Pending cash transfers to a coffer. Created by magasin user/manager, confirmed/rejected by admin.';

-- RLS (best-effort). Edge function uses service role, but keep policies consistent.
ALTER TABLE public.coffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_coffer_transfers ENABLE ROW LEVEL SECURITY;

-- Coffers: readable by authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'coffers' AND policyname = 'Coffers are viewable by authenticated users'
  ) THEN
    CREATE POLICY "Coffers are viewable by authenticated users" ON public.coffers
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Pending transfers: readable by authenticated users (backend still enforces role)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pending_coffer_transfers' AND policyname = 'Pending coffer transfers are viewable by authenticated users'
  ) THEN
    CREATE POLICY "Pending coffer transfers are viewable by authenticated users" ON public.pending_coffer_transfers
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Pending transfers: insertable by authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pending_coffer_transfers' AND policyname = 'Pending coffer transfers can be created by authenticated users'
  ) THEN
    CREATE POLICY "Pending coffer transfers can be created by authenticated users" ON public.pending_coffer_transfers
      FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
