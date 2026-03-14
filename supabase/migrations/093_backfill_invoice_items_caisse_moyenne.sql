-- Backfill invoice item fields caisse/moyenne for existing invoices
--
-- Context:
-- - New invoices now store {caisse, moyenne} in invoices.items (JSONB)
-- - Old invoices may not have these keys.
--
-- Strategy:
-- - For each invoice item, if caisse is missing/empty, set it to the product.number_of_boxes (when product can be resolved)
-- - For moyenne, if missing/empty and caisse+quantity available, set moyenne = quantity/caisse
--
-- Product resolution priority:
--   1) item.productId (new schema)
--   2) item.product_id (legacy)
--   3) match by item.reference (if present)
--   4) match by item.description/name/product_name (best effort)
--
-- Notes:
-- - This is best-effort and only fills when a product can be identified.
-- - Does NOT overwrite existing non-empty caisse/moyenne.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, items
    FROM public.invoices
    WHERE items IS NOT NULL
      AND jsonb_typeof(items) = 'array'
  LOOP
    UPDATE public.invoices i
    SET items = (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(it) <> 'object' THEN it
          ELSE
            (
              WITH
                -- Extract common fields
                pid AS (
                  SELECT NULLIF(COALESCE(it->>'productId', it->>'product_id', it->>'id'), '') AS product_id
                ),
                ref AS (
                  SELECT NULLIF(COALESCE(it->>'reference', it->>'ref'), '') AS reference
                ),
                nm AS (
                  SELECT NULLIF(COALESCE(it->>'description', it->>'name', it->>'product_name'), '') AS name
                ),
                qty AS (
                  SELECT COALESCE(NULLIF(it->>'quantity', ''), NULLIF(it->>'qty', ''), '0')::numeric AS quantity
                ),
                -- Find product row
                prod AS (
                  SELECT p.*
                  FROM public.products p
                  WHERE (SELECT product_id FROM pid) IS NOT NULL AND p.id::text = (SELECT product_id FROM pid)
                  UNION ALL
                  SELECT p.*
                  FROM public.products p
                  WHERE (SELECT reference FROM ref) IS NOT NULL AND p.reference = (SELECT reference FROM ref)
                  UNION ALL
                  SELECT p.*
                  FROM public.products p
                  WHERE (SELECT name FROM nm) IS NOT NULL AND lower(p.name) = lower((SELECT name FROM nm))
                  LIMIT 1
                ),
                boxes AS (
                  SELECT COALESCE((SELECT number_of_boxes FROM prod), NULL)::numeric AS caisse
                )
              SELECT
                -- Set caisse if missing/empty
                CASE
                  WHEN COALESCE(NULLIF(it->>'caisse', ''), NULLIF(it->>'box', ''), NULLIF(it->>'boxes', '')) IS NULL
                       AND (SELECT caisse FROM boxes) IS NOT NULL
                       AND (SELECT caisse FROM boxes) > 0
                    THEN
                      jsonb_set(
                        it,
                        '{caisse}',
                        to_jsonb((SELECT caisse FROM boxes))
                      )
                  ELSE it
                END
            )
        END
      )
      FROM jsonb_array_elements(i.items) AS it
    )
    WHERE i.id = r.id;

    -- Second pass: compute moyenne when possible
    UPDATE public.invoices i
    SET items = (
      SELECT jsonb_agg(
        CASE
          WHEN jsonb_typeof(it) <> 'object' THEN it
          ELSE
            (
              WITH
                qty AS (
                  SELECT COALESCE(NULLIF(it->>'quantity', ''), NULLIF(it->>'qty', ''), '0')::numeric AS quantity
                ),
                caisse AS (
                  SELECT COALESCE(NULLIF(it->>'caisse', ''), '0')::numeric AS caisse
                )
              SELECT
                CASE
                  WHEN COALESCE(NULLIF(it->>'moyenne', ''), NULLIF(it->>'average', '')) IS NULL
                       AND (SELECT caisse FROM caisse) > 0
                       AND (SELECT quantity FROM qty) > 0
                    THEN
                      jsonb_set(
                        it,
                        '{moyenne}',
                        to_jsonb(round((SELECT quantity FROM qty) / (SELECT caisse FROM caisse), 2))
                      )
                  ELSE it
                END
            )
        END
      )
      FROM jsonb_array_elements(i.items) AS it
    )
    WHERE i.id = r.id;

  END LOOP;
END $$;
