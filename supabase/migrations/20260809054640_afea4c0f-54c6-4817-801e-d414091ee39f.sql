CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role = 'admin'::public.app_role AND role = 'owner'::public.app_role))
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_ceo()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'owner'::public.app_role)
$function$;

UPDATE public.user_roles ur
SET role = 'owner'::public.app_role
FROM auth.users au
WHERE ur.user_id = au.id
  AND lower(au.email) = 'andam@outlook.com';

INSERT INTO public.user_roles (user_id, role)
SELECT au.id, 'owner'::public.app_role
FROM auth.users au
WHERE lower(au.email) = 'andam@outlook.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id
  );

DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "CEO can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "CEO can delete user roles" ON public.user_roles;
DROP POLICY IF EXISTS "CEO can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Privileged users can delete roles" ON public.user_roles;

CREATE POLICY "Privileged users can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_ceo()
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role = 'user'::public.app_role
  )
);

CREATE POLICY "Privileged users can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.is_ceo()
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role = 'user'::public.app_role
  )
)
WITH CHECK (
  public.is_ceo()
  OR role = 'user'::public.app_role
);

CREATE POLICY "Privileged users can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.is_ceo()
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role = 'user'::public.app_role
  )
);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_ceo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_ceo() TO authenticated, service_role;