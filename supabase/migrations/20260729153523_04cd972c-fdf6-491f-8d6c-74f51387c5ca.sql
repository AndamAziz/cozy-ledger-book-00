ALTER TABLE public.user_iptv_servers
  ADD COLUMN IF NOT EXISTS playlist_enc text,
  ADD COLUMN IF NOT EXISTS playlist_masked text;

DROP POLICY IF EXISTS "Users manage their own IPTV server" ON public.user_iptv_servers;
DROP POLICY IF EXISTS "Admins manage all IPTV servers" ON public.user_iptv_servers;

REVOKE ALL ON public.user_iptv_servers FROM authenticated;
REVOKE ALL ON public.user_iptv_servers FROM anon;
GRANT ALL ON public.user_iptv_servers TO service_role;

ALTER TABLE public.user_iptv_servers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.livetv_access;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.livetv_access REPLICA IDENTITY FULL;