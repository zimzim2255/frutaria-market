-- Add expense_type to expenses to support categorizing entries (e.g. deposit/withdrawal)
-- Fixes: Could not find the 'expense_type' column of 'expenses' in the schema cache

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS expense_type TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_expense_type ON expenses(expense_type);

COMMENT ON COLUMN expenses.expense_type IS 'Optional type for expense entries (e.g., expense, deposit, withdrawal, coffer_deposit, coffer_expense)';
