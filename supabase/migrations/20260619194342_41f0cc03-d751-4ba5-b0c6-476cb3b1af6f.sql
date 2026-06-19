-- Security-definer helper: is the current user the CEO?
CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND lower(email) = 'andam@outlook.com'
  )
$$;

-- Only the CEO may UPDATE a row whose current role is 'admin'
-- (i.e. demote an admin). Other admins may still update non-admin rows
-- (e.g. promote a regular user to admin).
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (role <> 'admin'::app_role OR public.is_ceo())
);

-- Only the CEO may DELETE a row whose role is 'admin'
-- (i.e. remove an admin's role). Other admins may delete non-admin role rows.
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  AND (role <> 'admin'::app_role OR public.is_ceo())
);