CREATE TABLE public.cached_market_prices (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cached_market_prices TO service_role;

ALTER TABLE public.cached_market_prices ENABLE ROW LEVEL SECURITY;