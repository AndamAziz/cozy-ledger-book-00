CREATE TABLE public.iptv_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'm3u',
  playlist_enc text,
  playlist_masked text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  last_test jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iptv_sources_user ON public.iptv_sources(user_id);
CREATE UNIQUE INDEX idx_iptv_sources_one_active ON public.iptv_sources(user_id) WHERE is_active;

GRANT ALL ON public.iptv_sources TO service_role;

ALTER TABLE public.iptv_sources ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_iptv_sources_updated_at
BEFORE UPDATE ON public.iptv_sources
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();