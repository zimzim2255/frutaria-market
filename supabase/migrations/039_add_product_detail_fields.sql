-- 039_add_product_detail_fields.sql
-- Add new fields to products table for detailed product information

DO $$
BEGIN
  -- number_of_boxes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'number_of_boxes'
  ) THEN
    ALTER TABLE products ADD COLUMN number_of_boxes integer DEFAULT 0;
  END IF;

  -- total_net_weight
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'total_net_weight'
  ) THEN
    ALTER TABLE products ADD COLUMN total_net_weight numeric DEFAULT 0;
  END IF;

  -- avg_net_weight_per_box
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'avg_net_weight_per_box'
  ) THEN
    ALTER TABLE products ADD COLUMN avg_net_weight_per_box numeric DEFAULT 0;
  END IF;

  -- max_purchase_limit
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'max_purchase_limit'
  ) THEN
    ALTER TABLE products ADD COLUMN max_purchase_limit integer;
  END IF;

END $$;
