CREATE OR REPLACE FUNCTION public.enforce_admin_approval_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- The CEO can make any change.
  IF public.is_ceo() THEN
    RETURN NEW;
  END IF;

  -- Non-CEO admins: limited scope.
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    -- These account fields can ONLY be changed by the CEO.
    IF NEW.company_name IS DISTINCT FROM OLD.company_name
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'Only the CEO can change account details (company name / active status / email)';
    END IF;

    -- Admins may NOT revoke an already-approved user (true -> false).
    IF OLD.is_approved = true AND NEW.is_approved = false THEN
      RAISE EXCEPTION 'Only the CEO can revoke a user';
    END IF;

    -- Allowed for admins:
    --   * Approve a pending user (false -> true), optionally setting expires_at
    --   * Renew / extend / change the expiry date (expires_at) of an approved user
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$function$;