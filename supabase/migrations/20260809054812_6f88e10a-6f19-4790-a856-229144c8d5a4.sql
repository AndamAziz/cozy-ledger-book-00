CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_approvals (user_id, email, is_approved, approved_at, expires_at)
  VALUES (NEW.id, NEW.email, true, now(), now() + interval '7 days');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.livetv_access (user_id, trial_started_at, trial_ends_at)
  VALUES (NEW.id, now(), now() + interval '24 hours')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;