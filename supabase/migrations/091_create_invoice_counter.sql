-- Create a concurrency-safe counter to generate unique Facture numbers.
-- This avoids duplicates across devices/users and ensures the counter is incremented
-- ONLY when we actually create an invoice.

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  id text PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure a default row exists
INSERT INTO public.invoice_counters (id, last_value)
VALUES ('global', 0)
ON CONFLICT (id) DO NOTHING;

-- Preview function (does not increment)
-- Returns a string like FAC-000001
CREATE OR REPLACE FUNCTION public.preview_next_invoice_number(counter_id text DEFAULT 'global')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  current_val bigint;
BEGIN
  SELECT last_value INTO current_val
  FROM public.invoice_counters
  WHERE id = counter_id;

  IF current_val IS NULL THEN
    INSERT INTO public.invoice_counters (id, last_value)
    VALUES (counter_id, 0)
    ON CONFLICT (id) DO NOTHING;

    current_val := 0;
  END IF;

  RETURN 'FAC-' || lpad((current_val + 1)::text, 6, '0');
END;
$$;

-- Consume function (increments atomically)
-- Returns a string like FAC-000001
CREATE OR REPLACE FUNCTION public.consume_next_invoice_number(counter_id text DEFAULT 'global')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  new_val bigint;
BEGIN
  UPDATE public.invoice_counters
  SET last_value = last_value + 1,
      updated_at = now()
  WHERE id = counter_id
  RETURNING last_value INTO new_val;

  IF new_val IS NULL THEN
    -- initialize and retry once
    INSERT INTO public.invoice_counters (id, last_value)
    VALUES (counter_id, 0)
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.invoice_counters
    SET last_value = last_value + 1,
        updated_at = now()
    WHERE id = counter_id
    RETURNING last_value INTO new_val;
  END IF;

  RETURN 'FAC-' || lpad(new_val::text, 6, '0');
END;
$$;
