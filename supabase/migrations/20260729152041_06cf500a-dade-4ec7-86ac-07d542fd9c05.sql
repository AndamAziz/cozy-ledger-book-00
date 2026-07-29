-- ============ Per-user IPTV servers ============
CREATE TABLE public.user_iptv_servers (
  user_id uuid PRIMARY KEY,
  playlist_url text NOT NULL DEFAULT '',
  provider_name text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_iptv_servers TO authenticated;
GRANT ALL ON public.user_iptv_servers TO service_role;

ALTER TABLE public.user_iptv_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own IPTV server"
  ON public.user_iptv_servers FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins manage all IPTV servers"
  ON public.user_iptv_servers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER user_iptv_servers_updated_at
  BEFORE UPDATE ON public.user_iptv_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Live TV access / trial / activation ============
CREATE TABLE public.livetv_access (
  user_id uuid PRIMARY KEY,
  trial_started_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  is_activated boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  activation_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.livetv_access TO authenticated;
GRANT INSERT, UPDATE ON public.livetv_access TO authenticated;
GRANT ALL ON public.livetv_access TO service_role;

ALTER TABLE public.livetv_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own Live TV access"
  ON public.livetv_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all Live TV access"
  ON public.livetv_access FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert Live TV access"
  ON public.livetv_access FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update Live TV access"
  ON public.livetv_access FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER livetv_access_updated_at
  BEFORE UPDATE ON public.livetv_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Access helper ============
CREATE OR REPLACE FUNCTION public.has_livetv_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.livetv_access
    WHERE user_id = _user_id
      AND (is_activated = true OR trial_ends_at > now())
  )
$$;

-- ============ New signups get a 24h Live TV trial ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_approvals (user_id, email, is_approved, approved_at, expires_at)
  VALUES (NEW.id, NEW.email, true, now(), now() + interval '7 days');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.livetv_access (user_id, trial_started_at, trial_ends_at)
  VALUES (NEW.id, now(), now() + interval '24 hours')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_iptv_servers (user_id, playlist_url)
  VALUES (NEW.id, '')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ============ Backfill existing accounts ============
INSERT INTO public.livetv_access (user_id, trial_started_at, trial_ends_at)
SELECT id, now(), now() + interval '24 hours' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_iptv_servers (user_id, playlist_url)
SELECT id, '' FROM auth.users
ON CONFLICT (user_id) DO NOTHING;