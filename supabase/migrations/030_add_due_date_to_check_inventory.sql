-- Add due_date column to check_inventory table
ALTER TABLE check_inventory
ADD COLUMN due_date DATE NULL;

-- Add comment to document the column
COMMENT ON COLUMN check_inventory.due_date IS 'Due date or execution date for the check';
