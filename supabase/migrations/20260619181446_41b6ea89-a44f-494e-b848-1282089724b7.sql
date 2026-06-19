ALTER TABLE public.ai_signals ADD COLUMN IF NOT EXISTS close_reason text;

COMMENT ON COLUMN public.ai_signals.close_reason IS 'How the leg closed: tp, sl, or period_close (timeframe candle closed without hitting TP/SL).';