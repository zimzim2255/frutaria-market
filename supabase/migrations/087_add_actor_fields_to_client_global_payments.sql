-- 088_add_actor_fields_to_client_global_payments.sql
-- Purpose: Add proper audit/actor info for client global payments

ALTER TABLE client_global_payments
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;

ALTER TABLE client_global_payments
  ADD COLUMN IF NOT EXISTS is_admin_payment BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE client_global_payments
  ADD COLUMN IF NOT EXISTS acted_as_store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_global_payments_is_admin_payment ON client_global_payments(is_admin_payment);
CREATE INDEX IF NOT EXISTS idx_client_global_payments_acted_as_store_id ON client_global_payments(acted_as_store_id);
