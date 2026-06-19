CREATE OR REPLACE FUNCTION public.get_email_auth_providers(_email text)
RETURNS TABLE(account_exists boolean, providers text[], has_password boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_user_id uuid;
  v_has_pw boolean;
  v_providers text[];
BEGIN
  SELECT u.id, (u.encrypted_password IS NOT NULL AND length(u.encrypted_password) > 0)
    INTO v_user_id, v_has_pw
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, ARRAY[]::text[], false;
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT i.provider)
    INTO v_providers
  FROM auth.identities i
  WHERE i.user_id = v_user_id;

  RETURN QUERY SELECT true, COALESCE(v_providers, ARRAY[]::text[]), COALESCE(v_has_pw, false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_auth_providers(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_auth_providers(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_email_auth_providers(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_auth_providers(text) TO service_role;