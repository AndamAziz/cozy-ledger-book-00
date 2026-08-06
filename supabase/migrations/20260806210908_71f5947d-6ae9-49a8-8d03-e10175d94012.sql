CREATE OR REPLACE FUNCTION public.has_livetv_access(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.livetv_access
    WHERE user_id = _user_id
      AND (is_activated = true OR trial_ends_at > now())
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_livetv_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_livetv_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_livetv_access(uuid) TO authenticated, service_role;