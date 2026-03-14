-- Update discounts table to allow 'store' entity_type
ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_entity_type_check;
ALTER TABLE discounts ADD CONSTRAINT discounts_entity_type_check CHECK (entity_type IN ('customer', 'supplier', 'store'));
