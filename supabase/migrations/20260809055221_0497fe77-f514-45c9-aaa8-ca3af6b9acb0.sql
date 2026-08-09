DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can update roles" ON public.user_roles;

CREATE POLICY "Owner can insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Owner can update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Owner can delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "Users can switch their own selected source" ON public.user_source_access;

DROP POLICY IF EXISTS "CEO can delete settings" ON public.app_settings;
CREATE POLICY "Owner can delete settings"
ON public.app_settings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "CEO deletes playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "CEO inserts playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "CEO updates playlists" ON public.iptv_playlists;
DROP POLICY IF EXISTS "Users view own or shared playlists" ON public.iptv_playlists;
CREATE POLICY "Owner deletes playlists"
ON public.iptv_playlists FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Owner inserts playlists"
ON public.iptv_playlists FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Owner updates playlists"
ON public.iptv_playlists FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Users view own or shared playlists"
ON public.iptv_playlists FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR (is_active = true) OR public.has_role(auth.uid(), 'owner'::public.app_role));

DROP POLICY IF EXISTS "CEO can delete streams" ON public.stream_servers;
DROP POLICY IF EXISTS "CEO can insert streams" ON public.stream_servers;
DROP POLICY IF EXISTS "CEO can update streams" ON public.stream_servers;
DROP POLICY IF EXISTS "Public can view active streams" ON public.stream_servers;
CREATE POLICY "Owner can delete streams"
ON public.stream_servers FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Owner can insert streams"
ON public.stream_servers FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Owner can update streams"
ON public.stream_servers FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE POLICY "Public can view active streams"
ON public.stream_servers FOR SELECT TO public
USING ((is_active = true) OR public.has_role(auth.uid(), 'owner'::public.app_role));