CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text NOT NULL CHECK (char_length(comment) >= 10 AND char_length(comment) <= 500),
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read approved reviews
CREATE POLICY "Anyone can view approved reviews"
ON public.reviews FOR SELECT
USING (is_approved = true);

-- Owners can view their own reviews (pending or approved)
CREATE POLICY "Users can view their own reviews"
ON public.reviews FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all reviews
CREATE POLICY "Admins can view all reviews"
ON public.reviews FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can insert their own review
CREATE POLICY "Users can insert their own review"
ON public.reviews FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Owners can update their own review while still pending
CREATE POLICY "Users can update own pending review"
ON public.reviews FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND is_approved = false)
WITH CHECK (auth.uid() = user_id AND is_approved = false);

-- Owners can delete their own review while still pending
CREATE POLICY "Users can delete own pending review"
ON public.reviews FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND is_approved = false);

-- Admins can update any review (including approval)
CREATE POLICY "Admins can update reviews"
ON public.reviews FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete any review
CREATE POLICY "Admins can delete reviews"
ON public.reviews FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER update_reviews_updated_at
BEFORE UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anti-spam: one review per user per 24 hours
CREATE OR REPLACE FUNCTION public.enforce_review_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE user_id = NEW.user_id
      AND created_at > now() - interval '24 hours'
  ) THEN
    RAISE EXCEPTION 'rate_limit: You can only submit one review every 24 hours';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_review_rate_limit_trigger
BEFORE INSERT ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.enforce_review_rate_limit();