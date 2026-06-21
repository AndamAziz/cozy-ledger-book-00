-- Prevent the approved_by admin UUID from being exposed via the Data API.
-- Column-level privileges apply to every role; nothing in the app displays
-- approved_by, so we simply stop granting SELECT on that column.
REVOKE SELECT ON public.user_approvals FROM anon;
REVOKE SELECT ON public.user_approvals FROM authenticated;

GRANT SELECT (id, user_id, email, is_approved, approved_at, expires_at,
              created_at, updated_at, company_name, is_active)
  ON public.user_approvals TO authenticated;