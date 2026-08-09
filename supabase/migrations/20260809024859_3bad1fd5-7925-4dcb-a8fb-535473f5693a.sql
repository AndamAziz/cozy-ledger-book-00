ALTER TABLE public.iptv_sources
  ADD COLUMN IF NOT EXISTS health_status text,
  ADD COLUMN IF NOT EXISTS health_message text,
  ADD COLUMN IF NOT EXISTS health_checked_at timestamptz;