-- Enums
CREATE TYPE public.bot_strategy AS ENUM ('conservative', 'balanced', 'aggressive');
CREATE TYPE public.bot_status AS ENUM ('idle', 'running', 'stopped');
CREATE TYPE public.trade_direction AS ENUM ('buy', 'sell');
CREATE TYPE public.trade_status AS ENUM ('open', 'closed');
CREATE TYPE public.trade_result AS ENUM ('win', 'loss');
CREATE TYPE public.trade_close_reason AS ENUM ('tp', 'sl', 'manual');

-- Bots
CREATE TABLE public.bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  asset_class TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '5m',
  amount NUMERIC NOT NULL DEFAULT 100,
  sl_pct NUMERIC NOT NULL DEFAULT 0.3,
  tp_pct NUMERIC NOT NULL DEFAULT 0.6,
  strategy public.bot_strategy NOT NULL DEFAULT 'balanced',
  status public.bot_status NOT NULL DEFAULT 'idle',
  trades_count INTEGER NOT NULL DEFAULT 0,
  wins_count INTEGER NOT NULL DEFAULT 0,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  last_scan_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own bots"
  ON public.bots FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Bot trades
CREATE TABLE public.bot_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  direction public.trade_direction NOT NULL,
  entry_price NUMERIC NOT NULL,
  sl_price NUMERIC NOT NULL,
  tp_price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  status public.trade_status NOT NULL DEFAULT 'open',
  exit_price NUMERIC,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  result public.trade_result,
  close_reason public.trade_close_reason,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

GRANT SELECT ON public.bot_trades TO authenticated;
GRANT ALL ON public.bot_trades TO service_role;
ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own trades"
  ON public.bot_trades FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Bot logs
CREATE TABLE public.bot_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bot_logs TO authenticated;
GRANT ALL ON public.bot_logs TO service_role;
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own logs"
  ON public.bot_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_bots_updated_at
  BEFORE UPDATE ON public.bots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_bots_user ON public.bots(user_id);
CREATE INDEX idx_bots_status ON public.bots(status);
CREATE INDEX idx_bot_trades_bot ON public.bot_trades(bot_id);
CREATE INDEX idx_bot_trades_open ON public.bot_trades(bot_id, status);
CREATE INDEX idx_bot_logs_bot ON public.bot_logs(bot_id, created_at DESC);

-- Realtime
ALTER TABLE public.bots REPLICA IDENTITY FULL;
ALTER TABLE public.bot_trades REPLICA IDENTITY FULL;
ALTER TABLE public.bot_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_logs;