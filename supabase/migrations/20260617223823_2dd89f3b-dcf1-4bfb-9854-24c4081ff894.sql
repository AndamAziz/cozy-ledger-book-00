-- Latest snapshot per symbol
CREATE TABLE public.market_prices (
  symbol text PRIMARY KEY,
  price numeric NOT NULL,
  change_pct numeric NOT NULL DEFAULT 0,
  trend text,
  signal text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_prices TO authenticated, anon;
GRANT ALL ON public.market_prices TO service_role;
ALTER TABLE public.market_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read market prices" ON public.market_prices FOR SELECT USING (true);

CREATE TABLE public.market_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text UNIQUE,
  title text NOT NULL,
  title_ku text,
  summary text,
  impact text,
  assets text[],
  bias text,
  source text,
  url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_news TO authenticated, anon;
GRANT ALL ON public.market_news TO service_role;
ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read market news" ON public.market_news FOR SELECT USING (true);

CREATE TABLE public.economic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ext_key text UNIQUE,
  title text NOT NULL,
  currency text,
  impact text,
  event_time timestamptz,
  forecast text,
  previous text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.economic_events TO authenticated, anon;
GRANT ALL ON public.economic_events TO service_role;
ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read economic events" ON public.economic_events FOR SELECT USING (true);

CREATE TABLE public.ai_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  signal text NOT NULL,
  entry numeric,
  tp numeric,
  sl numeric,
  confidence integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_signals TO authenticated, anon;
GRANT ALL ON public.ai_signals TO service_role;
ALTER TABLE public.ai_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ai signals" ON public.ai_signals FOR SELECT USING (true);

CREATE TABLE public.telegram_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text,
  chat_id text,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_logs TO authenticated;
GRANT ALL ON public.telegram_logs TO service_role;
ALTER TABLE public.telegram_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read telegram logs" ON public.telegram_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.market_alert_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_alert_state TO authenticated;
GRANT ALL ON public.market_alert_state TO service_role;
ALTER TABLE public.market_alert_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read alert state" ON public.market_alert_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));