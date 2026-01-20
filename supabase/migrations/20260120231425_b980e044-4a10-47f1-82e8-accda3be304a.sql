-- Add expense_type column to expenses table
ALTER TABLE public.expenses 
ADD COLUMN expense_type text NOT NULL DEFAULT 'cost';

-- Add check constraint for valid expense types
ALTER TABLE public.expenses 
ADD CONSTRAINT expense_type_check CHECK (expense_type IN ('purchase', 'cost'));