CREATE TABLE public.telegram_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text,
  recommendation text,
  confidence integer,
  price numeric,
  entry text,
  targets text[] DEFAULT '{}',
  stop_loss text,
  horizon_days integer,
  risk_level text,
  headline text,
  timeframe text,
  chat_id text,
  telegram_message_id bigint,
  status text NOT NULL DEFAULT 'sent',
  error text,
  sent_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_signals TO authenticated;
GRANT ALL ON public.telegram_signals TO service_role;

ALTER TABLE public.telegram_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sent signals"
ON public.telegram_signals
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_telegram_signals_created_at ON public.telegram_signals (created_at DESC);