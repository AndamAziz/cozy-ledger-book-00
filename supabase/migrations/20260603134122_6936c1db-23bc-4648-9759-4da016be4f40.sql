CREATE TABLE public.demo_accounts (
  user_id uuid NOT NULL PRIMARY KEY,
  balance numeric NOT NULL DEFAULT 100000,
  starting_balance numeric NOT NULL DEFAULT 100000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_accounts TO authenticated;
GRANT ALL ON public.demo_accounts TO service_role;

ALTER TABLE public.demo_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own demo account"
  ON public.demo_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own demo account"
  ON public.demo_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own demo account"
  ON public.demo_accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid());