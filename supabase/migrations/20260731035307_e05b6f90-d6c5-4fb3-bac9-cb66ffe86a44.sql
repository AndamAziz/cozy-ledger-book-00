DROP POLICY IF EXISTS "Users view own playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "Users insert own playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "Users update own playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "Users delete own playlists" ON public.iptv_playlists;

CREATE POLICY "Anyone signed in can view playlists" ON public.iptv_playlists
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "CEO inserts playlists" ON public.iptv_playlists
  FOR INSERT TO authenticated WITH CHECK (public.is_ceo());

CREATE POLICY "CEO updates playlists" ON public.iptv_playlists
  FOR UPDATE TO authenticated USING (public.is_ceo()) WITH CHECK (public.is_ceo());

CREATE POLICY "CEO deletes playlists" ON public.iptv_playlists
  FOR DELETE TO authenticated USING (public.is_ceo());