ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_reason_at timestamptz;