-- 1. Restrict IPTV playlist visibility: own rows or shared (active) rows only
DROP POLICY IF EXISTS "Anyone signed in can view playlists" ON public.iptv_playlists;
CREATE POLICY "Users view own or shared playlists"
ON public.iptv_playlists
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR is_active = true OR public.is_ceo());

-- 2. Lock down SECURITY DEFINER functions from anon / unnecessary callers
REVOKE EXECUTE ON FUNCTION public.has_livetv_access(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated;

-- 3. Pin search_path on the remaining mutable-search_path functions
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;