CREATE TABLE public.iptv_playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  last_status text,
  last_latency_ms integer,
  channel_count integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iptv_playlists TO authenticated;
GRANT ALL ON public.iptv_playlists TO service_role;

ALTER TABLE public.iptv_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own playlists" ON public.iptv_playlists
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own playlists" ON public.iptv_playlists
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own playlists" ON public.iptv_playlists
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own playlists" ON public.iptv_playlists
  FOR DELETE TO authenticated USING (auth.uid() = user_id);