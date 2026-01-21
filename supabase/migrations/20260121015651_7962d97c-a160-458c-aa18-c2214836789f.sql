-- Insert missing users into user_approvals from auth.users
-- First, let's add the missing users: ctpaccountancy@outlook.com and andamazhi@gmail.com

-- We need to get user IDs from auth.users and insert into user_approvals if they don't exist
INSERT INTO public.user_approvals (user_id, email, is_approved, company_name)
SELECT id, email, false, NULL
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_approvals)
ON CONFLICT (user_id) DO NOTHING;

-- Also ensure all users have roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'::app_role
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT DO NOTHING;