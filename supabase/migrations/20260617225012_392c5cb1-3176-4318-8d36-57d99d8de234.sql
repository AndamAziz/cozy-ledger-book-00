-- =========================================================
-- 1. Restrict personal-data table policies to authenticated
-- =========================================================

-- expenses
DROP POLICY IF EXISTS "Users can create their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view their own expenses" ON public.expenses;
CREATE POLICY "Users can create their own expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own expenses" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own expenses" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own expenses" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- sales
DROP POLICY IF EXISTS "Users can create their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can delete their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can update their own sales" ON public.sales;
DROP POLICY IF EXISTS "Users can view their own sales" ON public.sales;
CREATE POLICY "Users can create their own sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sales" ON public.sales FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own sales" ON public.sales FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own sales" ON public.sales FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- incomes
DROP POLICY IF EXISTS "Users can create their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can delete their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can update their own incomes" ON public.incomes;
DROP POLICY IF EXISTS "Users can view their own incomes" ON public.incomes;
CREATE POLICY "Users can create their own incomes" ON public.incomes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own incomes" ON public.incomes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own incomes" ON public.incomes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own incomes" ON public.incomes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- cigarettes
DROP POLICY IF EXISTS "Users can create their own cigarettes" ON public.cigarettes;
DROP POLICY IF EXISTS "Users can delete their own cigarettes" ON public.cigarettes;
DROP POLICY IF EXISTS "Users can update their own cigarettes" ON public.cigarettes;
DROP POLICY IF EXISTS "Users can view their own cigarettes" ON public.cigarettes;
CREATE POLICY "Users can create their own cigarettes" ON public.cigarettes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own cigarettes" ON public.cigarettes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own cigarettes" ON public.cigarettes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own cigarettes" ON public.cigarettes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- admin_activity_logs
DROP POLICY IF EXISTS "Admins can insert activity logs" ON public.admin_activity_logs;
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.admin_activity_logs;
CREATE POLICY "Admins can insert activity logs" ON public.admin_activity_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all activity logs" ON public.admin_activity_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 2. Restrict market data reads to authenticated users
-- =========================================================
DROP POLICY IF EXISTS "Anyone can read ai signals" ON public.ai_signals;
CREATE POLICY "Authenticated can read ai signals" ON public.ai_signals FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read market prices" ON public.market_prices;
CREATE POLICY "Authenticated can read market prices" ON public.market_prices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read market news" ON public.market_news;
CREATE POLICY "Authenticated can read market news" ON public.market_news FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can read economic events" ON public.economic_events;
CREATE POLICY "Authenticated can read economic events" ON public.economic_events FOR SELECT TO authenticated USING (true);

-- =========================================================
-- 3. Lock down SECURITY DEFINER functions
-- =========================================================

-- has_role: needed by RLS policies for authenticated users; not for anon
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- is_user_approved: add self/admin guard, block anonymous callers
CREATE OR REPLACE FUNCTION public.is_user_approved(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.user_approvals
    WHERE user_id = _user_id
      AND is_approved = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.is_user_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_user_approved(uuid) TO authenticated;

-- get_user_approval_status: add self/admin guard, block anonymous callers
CREATE OR REPLACE FUNCTION public.get_user_approval_status(_user_id uuid)
RETURNS TABLE(is_approved boolean, expires_at timestamp with time zone, is_expired boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT
    ua.is_approved,
    ua.expires_at,
    CASE WHEN ua.expires_at IS NOT NULL AND ua.expires_at < now() THEN true ELSE false END AS is_expired
  FROM public.user_approvals ua
  WHERE ua.user_id = _user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_user_approval_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_approval_status(uuid) TO authenticated;

-- trigger / utility functions should never be callable from the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
