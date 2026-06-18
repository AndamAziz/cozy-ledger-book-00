CREATE TABLE public.signal_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  signal text NOT NULL,
  price numeric,
  change_pct numeric,
  outcome text NOT NULL,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.signal_audit_log TO authenticated;
GRANT ALL ON public.signal_audit_log TO service_role;

ALTER TABLE public.signal_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view signal audit log"
ON public.signal_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_signal_audit_log_created_at ON public.signal_audit_log (created_at DESC);
CREATE INDEX idx_signal_audit_log_symbol ON public.signal_audit_log (symbol);