-- Fix expenses RLS so manager/user accounts can see their own created expenses,
-- while admin can still see everything.
--
-- Problem observed:
-- - manager/user can INSERT into expenses, but cannot SELECT them back.
-- Root cause:
-- - existing select policy relies on users.store_id. Some accounts have NULL/incorrect store_id
--   (not backfilled), so SELECT returns 0 rows.
--
-- Solution:
-- - Keep admin full visibility
-- - For non-admin, allow selecting rows they created (created_by = auth.uid())
-- - Keep store-based visibility too (so store users still see store-scoped system movements)

BEGIN;

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Replace select policy
DROP POLICY IF EXISTS "expenses_select_policy" ON public.expenses;

CREATE POLICY "expenses_select_policy" ON public.expenses
  FOR SELECT
  USING (
    -- Admin can see all
    auth.uid() IN (
      SELECT id FROM public.users WHERE role = 'admin'
    )
    OR
    -- Any user can see expenses they created
    created_by = auth.uid()
    OR
    -- Users can also see expenses for their store (when store_id is set)
    store_id IN (
      SELECT store_id FROM public.users WHERE id = auth.uid()
    )
  );

COMMIT;
