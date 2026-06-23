ALTER TABLE public.telegram_logs ADD COLUMN IF NOT EXISTS asset text;
CREATE INDEX IF NOT EXISTS idx_telegram_logs_asset_created ON public.telegram_logs (asset, created_at DESC);