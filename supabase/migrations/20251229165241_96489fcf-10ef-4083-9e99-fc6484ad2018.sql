-- Create table for incomes
CREATE TABLE public.incomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,
  day INTEGER NOT NULL,
  cash NUMERIC NOT NULL DEFAULT 0,
  card NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for expenses
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,
  day INTEGER NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for cigarettes (inventory)
CREATE TABLE public.cigarettes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,
  name TEXT NOT NULL,
  packs_per_box INTEGER NOT NULL DEFAULT 10,
  pack_price NUMERIC NOT NULL DEFAULT 0,
  box_price NUMERIC NOT NULL DEFAULT 0,
  boxes INTEGER NOT NULL DEFAULT 0,
  extra_packs INTEGER NOT NULL DEFAULT 0,
  alert_level INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for sales
CREATE TABLE public.sales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  month_key TEXT NOT NULL,
  day INTEGER NOT NULL,
  cigarette_id UUID REFERENCES public.cigarettes(id) ON DELETE SET NULL,
  cigarette_name TEXT NOT NULL,
  packs INTEGER NOT NULL DEFAULT 0,
  pack_price NUMERIC NOT NULL DEFAULT 0,
  total_sale NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cigarettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for incomes
CREATE POLICY "Users can view their own incomes"
ON public.incomes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own incomes"
ON public.incomes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own incomes"
ON public.incomes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own incomes"
ON public.incomes FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for expenses
CREATE POLICY "Users can view their own expenses"
ON public.expenses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own expenses"
ON public.expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expenses"
ON public.expenses FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expenses"
ON public.expenses FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for cigarettes
CREATE POLICY "Users can view their own cigarettes"
ON public.cigarettes FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cigarettes"
ON public.cigarettes FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cigarettes"
ON public.cigarettes FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cigarettes"
ON public.cigarettes FOR DELETE
USING (auth.uid() = user_id);

-- Create RLS policies for sales
CREATE POLICY "Users can view their own sales"
ON public.sales FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sales"
ON public.sales FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sales"
ON public.sales FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sales"
ON public.sales FOR DELETE
USING (auth.uid() = user_id);