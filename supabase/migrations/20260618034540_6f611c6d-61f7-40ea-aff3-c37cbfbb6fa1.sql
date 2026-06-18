ALTER TABLE public.sent_news_log
  ADD COLUMN IF NOT EXISTS asset text,
  ADD COLUMN IF NOT EXISTS event_keyword text,
  ADD COLUMN IF NOT EXISTS urgency text;

CREATE INDEX IF NOT EXISTS idx_sent_news_log_asset_sent_at
  ON public.sent_news_log (asset, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_sent_news_log_asset_event_sent_at
  ON public.sent_news_log (asset, event_keyword, sent_at DESC);