ALTER TABLE public.ai_signals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS result_pips numeric,
  ADD COLUMN IF NOT EXISTS close_price numeric,
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS market_session text,
  ADD COLUMN IF NOT EXISTS tp_pips numeric,
  ADD COLUMN IF NOT EXISTS sl_pips numeric;

CREATE INDEX IF NOT EXISTS idx_ai_signals_status ON public.ai_signals (status);
CREATE INDEX IF NOT EXISTS idx_ai_signals_created_at ON public.ai_signals (created_at DESC);