CREATE OR REPLACE FUNCTION public.enforce_admin_approval_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The CEO can make any change.
  IF public.is_ceo() THEN
    RETURN NEW;
  END IF;

  -- Non-CEO admins may ONLY approve a pending (not yet approved) user.
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    -- Allowed action: the initial approval transition (false -> true).
    IF OLD.is_approved = false AND NEW.is_approved = true THEN
      -- They may set approved_at / expires_at as part of approval,
      -- but must NOT alter other account fields.
      IF NEW.company_name IS DISTINCT FROM OLD.company_name
         OR NEW.is_active IS DISTINCT FROM OLD.is_active
         OR NEW.email IS DISTINCT FROM OLD.email
         OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Only the CEO can change account details; admins may only approve new users';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only the CEO can perform this action; admins may only approve new users';
  END IF;

  RAISE EXCEPTION 'Not authorized';
END;
$$;

DROP TRIGGER IF EXISTS enforce_admin_approval_scope_trigger ON public.user_approvals;

CREATE TRIGGER enforce_admin_approval_scope_trigger
BEFORE UPDATE ON public.user_approvals
FOR EACH ROW
EXECUTE FUNCTION public.enforce_admin_approval_scope();