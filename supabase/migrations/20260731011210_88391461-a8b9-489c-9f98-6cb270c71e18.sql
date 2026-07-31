CREATE TABLE public.iptv_playlist_cache (
  url_hash text PRIMARY KEY,
  version text NOT NULL,
  entries_gz text NOT NULL,
  etag text,
  last_modified text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.iptv_playlist_cache TO service_role;

ALTER TABLE public.iptv_playlist_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.iptv_playlist_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_iptv_playlist_cache_updated_at
  BEFORE UPDATE ON public.iptv_playlist_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();