-- Add van delivery attachment field to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS van_delivery_attachment_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS van_delivery_attachment_type VARCHAR(50); -- 'image' or 'pdf'
ALTER TABLE products ADD COLUMN IF NOT EXISTS van_delivery_notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN products.van_delivery_attachment_url IS 'URL to the van/delivery attachment (image or PDF)';
COMMENT ON COLUMN products.van_delivery_attachment_type IS 'Type of attachment: image or pdf';
COMMENT ON COLUMN products.van_delivery_notes IS 'Notes about the van delivery';
