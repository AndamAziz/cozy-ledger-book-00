-- Revert the security-definer view approach in favour of column-level privileges.
DROP VIEW IF EXISTS public.public_reviews;

-- Restrict the user_id column from being SELECTed via the Data API by anyone.
-- Column-level privileges apply to every role, so internal UUIDs stay private
-- while all other review fields remain readable.
REVOKE SELECT ON public.reviews FROM anon;
REVOKE SELECT ON public.reviews FROM authenticated;

GRANT SELECT (id, reviewer_name, rating, comment, is_approved, created_at)
  ON public.reviews TO anon, authenticated;

-- Restore public read access to approved reviews (row-level), now without
-- exposing user_id because of the column grant above.
CREATE POLICY "Anyone can view approved reviews"
ON public.reviews
FOR SELECT
TO anon, authenticated
USING (is_approved = true);