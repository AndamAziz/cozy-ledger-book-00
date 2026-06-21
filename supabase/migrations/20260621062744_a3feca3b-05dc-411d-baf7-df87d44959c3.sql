CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- New users are automatically active for 7 days, no approval needed.
  INSERT INTO public.user_approvals (user_id, email, is_approved, approved_at, expires_at)
  VALUES (NEW.id, NEW.email, true, now(), now() + interval '7 days');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  RETURN NEW;
END;
$function$;