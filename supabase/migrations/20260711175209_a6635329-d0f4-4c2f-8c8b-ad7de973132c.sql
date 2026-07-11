-- Currency enum
DO $$ BEGIN
  CREATE TYPE public.currency_code AS ENUM ('GBP', 'IQD', 'EUR');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- updated_at helper already exists: public.update_updated_at_column()

-- ============ LOCATIONS ============
CREATE TABLE public.locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own locations" ON public.locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own locations" ON public.locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own locations" ON public.locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own locations" ON public.locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ INCOMES: new columns ============
ALTER TABLE public.incomes
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

-- ============ INCOME AMOUNTS (child, up to 3 currencies) ============
CREATE TABLE public.income_amounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  income_id uuid NOT NULL REFERENCES public.incomes(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL DEFAULT 'GBP',
  cash numeric NOT NULL DEFAULT 0,
  card numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_income_amounts_income_id ON public.income_amounts(income_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_amounts TO authenticated;
GRANT ALL ON public.income_amounts TO service_role;

ALTER TABLE public.income_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own income_amounts" ON public.income_amounts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.incomes i WHERE i.id = income_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can create their own income_amounts" ON public.income_amounts
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.incomes i WHERE i.id = income_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can update their own income_amounts" ON public.income_amounts
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.incomes i WHERE i.id = income_id AND i.user_id = auth.uid()));
CREATE POLICY "Users can delete their own income_amounts" ON public.income_amounts
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.incomes i WHERE i.id = income_id AND i.user_id = auth.uid()));

-- ============ EXPENSES: new column ============
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

-- ============ EXPENSE AMOUNTS (child, up to 3 currencies) ============
CREATE TABLE public.expense_amounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id uuid NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  currency public.currency_code NOT NULL DEFAULT 'GBP',
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_amounts_expense_id ON public.expense_amounts(expense_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_amounts TO authenticated;
GRANT ALL ON public.expense_amounts TO service_role;

ALTER TABLE public.expense_amounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own expense_amounts" ON public.expense_amounts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can create their own expense_amounts" ON public.expense_amounts
  FOR INSERT TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can update their own expense_amounts" ON public.expense_amounts
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid()));
CREATE POLICY "Users can delete their own expense_amounts" ON public.expense_amounts
  FOR DELETE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.expenses e WHERE e.id = expense_id AND e.user_id = auth.uid()));

-- ============ SALES: new columns ============
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency public.currency_code NOT NULL DEFAULT 'GBP';

-- ============ BACK-FILL existing data into child tables as GBP ============
INSERT INTO public.income_amounts (income_id, currency, cash, card)
SELECT i.id, 'GBP'::public.currency_code, i.cash, i.card
FROM public.incomes i
WHERE NOT EXISTS (SELECT 1 FROM public.income_amounts ia WHERE ia.income_id = i.id);

INSERT INTO public.expense_amounts (expense_id, currency, amount)
SELECT e.id, 'GBP'::public.currency_code, e.amount
FROM public.expenses e
WHERE NOT EXISTS (SELECT 1 FROM public.expense_amounts ea WHERE ea.expense_id = e.id);