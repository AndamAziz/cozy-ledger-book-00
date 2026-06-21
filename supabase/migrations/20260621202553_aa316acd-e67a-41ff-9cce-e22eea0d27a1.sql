-- 1) Fix public exposure of internal user UUIDs via reviews table.
-- Remove the public SELECT policy that exposed every column (including user_id)
-- to anonymous visitors, and expose only non-identifying columns through a view.

DROP POLICY IF EXISTS "Anyone can view approved reviews" ON public.reviews;

-- Public-facing view that excludes user_id. SECURITY INVOKER off (definer) so the
-- view owner reads approved rows; only safe columns are projected.
CREATE OR REPLACE VIEW public.public_reviews
WITH (security_invoker = false) AS
SELECT
  id,
  reviewer_name,
  rating,
  comment,
  is_approved,
  created_at
FROM public.reviews
WHERE is_approved = true;

GRANT SELECT ON public.public_reviews TO anon, authenticated;

-- 2) Make admin_activity_logs append-only: explicitly block UPDATE and DELETE
-- so admins cannot tamper with or destroy the audit trail.
CREATE POLICY "No one can update activity logs"
ON public.admin_activity_logs
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No one can delete activity logs"
ON public.admin_activity_logs
FOR DELETE
TO authenticated
USING (false);