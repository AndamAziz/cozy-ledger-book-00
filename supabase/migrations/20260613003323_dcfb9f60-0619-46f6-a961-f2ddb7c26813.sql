CREATE UNIQUE INDEX IF NOT EXISTS bot_trades_one_open_per_bot
  ON public.bot_trades (bot_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS bot_trades_closed_idx
  ON public.bot_trades (bot_id, closed_at)
  WHERE status = 'closed';