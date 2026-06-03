ALTER TABLE public.demo_accounts ALTER COLUMN balance SET DEFAULT 200;
ALTER TABLE public.demo_accounts ALTER COLUMN starting_balance SET DEFAULT 200;
UPDATE public.demo_accounts SET balance = 200, starting_balance = 200, updated_at = now();