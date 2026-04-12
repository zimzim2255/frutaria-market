-- Fix invoices RLS to allow service role access
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own invoices" ON invoices;
DROP POLICY IF EXISTS "Users can create invoices" ON invoices;
DROP POLICY IF EXISTS "Users can update their own invoices" ON invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON invoices;

-- Disable RLS temporarily to allow service role to work
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS with better policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all invoices (service role will bypass this anyway)
CREATE POLICY "Allow authenticated users to view invoices" ON invoices
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow authenticated users to create invoices
CREATE POLICY "Allow authenticated users to create invoices" ON invoices
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow authenticated users to update invoices
CREATE POLICY "Allow authenticated users to update invoices" ON invoices
  FOR UPDATE USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Allow service role to delete invoices
CREATE POLICY "Allow service role to delete invoices" ON invoices
  FOR DELETE USING (auth.role() = 'service_role');
