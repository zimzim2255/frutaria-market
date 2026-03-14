-- Create a concurrency-safe counter for stock_reference allocation
-- This avoids race conditions from "SELECT max + 1".

CREATE TABLE IF NOT EXISTS stock_reference_counter (
  id INTEGER PRIMARY KEY,
  last_number BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a single row exists
INSERT INTO stock_reference_counter (id, last_number)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;
