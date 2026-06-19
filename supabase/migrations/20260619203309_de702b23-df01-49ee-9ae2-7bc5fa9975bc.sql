-- 1) Close admin-role escalation on INSERT (mirror UPDATE/DELETE guards)
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND ((role <> 'admin'::app_role) OR is_ceo())
);

-- 2) Prevent anonymous execution of the SECURITY DEFINER helper.
--    Authenticated keeps its explicit grant (needed for RLS evaluation).
REVOKE EXECUTE ON FUNCTION public.is_ceo() FROM anon, PUBLIC;