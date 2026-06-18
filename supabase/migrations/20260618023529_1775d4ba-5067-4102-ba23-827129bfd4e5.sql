CREATE TABLE public.sent_news_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  content_hash text NOT NULL,
  headline text,
  kind text NOT NULL DEFAULT 'news',
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_sent_news_log_hash_time ON public.sent_news_log (content_hash, sent_at DESC);
CREATE INDEX idx_sent_news_log_kind_time ON public.sent_news_log (kind, sent_at DESC);

GRANT ALL ON public.sent_news_log TO service_role;

ALTER TABLE public.sent_news_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sent news log"
ON public.sent_news_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));