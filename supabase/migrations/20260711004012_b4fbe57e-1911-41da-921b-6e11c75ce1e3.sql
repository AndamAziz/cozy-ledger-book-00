-- Fix: Public (anon) can execute SECURITY DEFINER functions (linter 0028)
-- These functions are internal/RLS helpers and must never be callable by anonymous users.

-- Internal email-queue plumbing: only ever invoked by cron / service_role.
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon;

-- Authorization helper used inside RLS policies: authenticated must keep access.
REVOKE EXECUTE ON FUNCTION public.is_ceo() FROM anon;