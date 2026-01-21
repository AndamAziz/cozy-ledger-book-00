
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service can insert approvals" ON public.user_approvals;

-- The trigger function already runs with SECURITY DEFINER so it can bypass RLS
-- No need for a separate policy for service role inserts
