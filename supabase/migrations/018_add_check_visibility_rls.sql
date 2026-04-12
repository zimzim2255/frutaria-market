-- ============================================
-- ADD ROW LEVEL SECURITY FOR CHECK VISIBILITY
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Check inventory is viewable by authenticated users" ON check_inventory;
DROP POLICY IF EXISTS "Check inventory can be created by authenticated users" ON check_inventory;
DROP POLICY IF EXISTS "Check inventory can be updated by authenticated users" ON check_inventory;
DROP POLICY IF EXISTS "Check inventory can be deleted by authenticated users" ON check_inventory;

-- New RLS Policies for check_inventory with proper visibility restrictions

-- SELECT: Only receiver, giver, or admin can view
CREATE POLICY "Check inventory viewable by receiver, giver, or admin" ON check_inventory
  FOR SELECT USING (
    auth.uid() = receiver_id 
    OR auth.uid() = giver_id 
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- INSERT: Only authenticated users can create
CREATE POLICY "Check inventory can be created by authenticated users" ON check_inventory
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- UPDATE: Only receiver, giver, or admin can update
CREATE POLICY "Check inventory can be updated by receiver, giver, or admin" ON check_inventory
  FOR UPDATE USING (
    auth.uid() = receiver_id 
    OR auth.uid() = giver_id 
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- DELETE: Only admin can delete
CREATE POLICY "Check inventory can be deleted by admin only" ON check_inventory
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'admin'
    )
  );

-- Add comment for documentation
COMMENT ON TABLE check_inventory IS 'Check inventory with RLS - only receiver, giver, or admin can view/edit';
