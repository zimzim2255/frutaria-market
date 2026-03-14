-- Create a concurrency-safe counter to generate unique Bon de Livraison (BL) numbers.

-- 1) Counter table
CREATE TABLE IF NOT EXISTS public.bl_counters (
  id text PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure a default row exists
INSERT INTO public.bl_counters (id, last_value)
VALUES ('global', 0)
ON CONFLICT (id) DO NOTHING;

-- 2) Function to atomically increment and return next BL number.
-- Returns a string like BL-00001
CREATE OR REPLACE FUNCTION public.next_bl_number(counter_id text DEFAULT 'global')
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_next bigint;
BEGIN
  UPDATE public.bl_counters
  SET last_value = last_value + 1,
      updated_at = now()
  WHERE id = counter_id
  RETURNING last_value INTO v_next;

  IF v_next IS NULL THEN
    -- If counter row missing for some reason, create it and retry
    INSERT INTO public.bl_counters (id, last_value)
    VALUES (counter_id, 1)
    ON CONFLICT (id) DO UPDATE
      SET last_value = public.bl_counters.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_next;
  END IF;

  RETURN 'BL-' || lpad(v_next::text, 5, '0');
END;
$$;

-- 3) Optional: keep sale_number unique when it's a BL.
-- If you already have a unique index/constraint on sales.sale_number, you can skip this.
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_sale_number_unique ON public.sales(sale_number);
