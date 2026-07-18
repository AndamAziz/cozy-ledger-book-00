
-- Make server-only intent explicit for tables accessed only via edge functions (service_role).
-- Adding explicit restrictive policies for authenticated/anon documents that no client access is intended.

CREATE POLICY "No client access to cached_market_prices"
  ON public.cached_market_prices
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No client access to resolved_links"
  ON public.resolved_links
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "No client writes to market_alert_state"
  ON public.market_alert_state
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
