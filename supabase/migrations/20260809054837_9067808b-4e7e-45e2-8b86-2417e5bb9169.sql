REVOKE EXECUTE ON FUNCTION public.is_ceo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ceo() TO service_role;