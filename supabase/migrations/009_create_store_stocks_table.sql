CREATE TABLE IF NOT EXISTS store_stocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_stocks_product_id ON store_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_store_stocks_store_id ON store_stocks(store_id);
CREATE INDEX IF NOT EXISTS idx_store_stocks_product_store ON store_stocks(product_id, store_id);

ALTER TABLE store_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store stocks are viewable by authenticated users" ON store_stocks;
DROP POLICY IF EXISTS "Store stocks can be created by authenticated users" ON store_stocks;
DROP POLICY IF EXISTS "Store stocks can be updated by authenticated users" ON store_stocks;
DROP POLICY IF EXISTS "Store stocks can be deleted by authenticated users" ON store_stocks;

CREATE POLICY "Store stocks are viewable by authenticated users" ON store_stocks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Store stocks can be created by authenticated users" ON store_stocks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Store stocks can be updated by authenticated users" ON store_stocks
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Store stocks can be deleted by authenticated users" ON store_stocks
  FOR DELETE USING (auth.role() = 'authenticated');
