CREATE TABLE public.resolved_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  short_url TEXT NOT NULL UNIQUE,
  resolved_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT ALL ON public.resolved_links TO service_role;

ALTER TABLE public.resolved_links ENABLE ROW LEVEL SECURITY;
-- No public policies: this cache is written and read only by the
-- resolve-short-link edge function using the service role.