CREATE TABLE public.session_posts_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  region text NOT NULL,
  kind text NOT NULL,
  session_date date NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, kind, session_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_posts_log TO authenticated;
GRANT ALL ON public.session_posts_log TO service_role;

ALTER TABLE public.session_posts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view session posts log"
ON public.session_posts_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_session_posts_log_lookup ON public.session_posts_log (session_date, region, kind);