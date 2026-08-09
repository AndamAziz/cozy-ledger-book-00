-- 1. Join table: which pool sources a user may browse
CREATE TABLE public.user_source_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source_id uuid NOT NULL REFERENCES public.iptv_sources(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  granted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_id)
);

CREATE UNIQUE INDEX user_source_access_one_default
  ON public.user_source_access (user_id) WHERE is_default;
CREATE INDEX user_source_access_user_idx ON public.user_source_access (user_id);
CREATE INDEX user_source_access_source_idx ON public.user_source_access (source_id);

-- 2. Grants
GRANT SELECT, UPDATE ON public.user_source_access TO authenticated;
GRANT ALL ON public.user_source_access TO service_role;

-- 3. RLS
ALTER TABLE public.user_source_access ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Users can see their own source grants"
  ON public.user_source_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can switch their own selected source"
  ON public.user_source_access FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER user_source_access_updated_at
  BEFORE UPDATE ON public.user_source_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Backfill: existing per-user copies + legacy single-server rows -> pool grants
DO $$
DECLARE
  v_ceo uuid;
  r RECORD;
  v_pool uuid;
BEGIN
  SELECT id INTO v_ceo FROM auth.users WHERE lower(email) = 'andam@outlook.com' LIMIT 1;
  IF v_ceo IS NULL THEN
    RAISE NOTICE 'No CEO account found - skipping backfill';
    RETURN;
  END IF;

  -- 5a. Consumer copies in iptv_sources -> pool row (matched on masked url)
  FOR r IN
    SELECT s.user_id, s.name, s.kind, s.playlist_enc, s.playlist_masked,
           s.last_test, bool_or(s.is_active) AS was_active
    FROM public.iptv_sources s
    WHERE s.user_id <> v_ceo
      AND coalesce(s.playlist_masked, '') <> ''
      AND s.playlist_enc IS NOT NULL
    GROUP BY s.user_id, s.name, s.kind, s.playlist_enc, s.playlist_masked, s.last_test
  LOOP
    SELECT id INTO v_pool FROM public.iptv_sources
      WHERE user_id = v_ceo AND playlist_masked = r.playlist_masked LIMIT 1;
    IF v_pool IS NULL THEN
      INSERT INTO public.iptv_sources (user_id, name, kind, playlist_enc, playlist_masked, last_test, is_active, created_by)
      VALUES (v_ceo, r.name, r.kind, r.playlist_enc, r.playlist_masked, r.last_test, false, v_ceo)
      RETURNING id INTO v_pool;
    END IF;

    INSERT INTO public.user_source_access (user_id, source_id, is_default, granted_by)
    VALUES (r.user_id, v_pool, false, v_ceo)
    ON CONFLICT (user_id, source_id) DO NOTHING;

    IF r.was_active THEN
      UPDATE public.user_source_access SET is_default = false
        WHERE user_id = r.user_id AND is_default AND source_id <> v_pool;
      UPDATE public.user_source_access SET is_default = true
        WHERE user_id = r.user_id AND source_id = v_pool;
    END IF;
  END LOOP;

  -- 5b. Legacy single-server rows with no matching iptv_sources copy
  FOR r IN
    SELECT u.user_id, coalesce(u.provider_name, 'Assigned source') AS name,
           u.playlist_enc, coalesce(u.playlist_masked, '') AS playlist_masked
    FROM public.user_iptv_servers u
    WHERE u.playlist_enc IS NOT NULL
      AND coalesce(u.playlist_masked, '') <> ''
      AND NOT EXISTS (SELECT 1 FROM public.user_source_access a WHERE a.user_id = u.user_id)
  LOOP
    SELECT id INTO v_pool FROM public.iptv_sources
      WHERE user_id = v_ceo AND playlist_masked = r.playlist_masked LIMIT 1;
    IF v_pool IS NULL THEN
      INSERT INTO public.iptv_sources (user_id, name, kind, playlist_enc, playlist_masked, is_active, created_by)
      VALUES (v_ceo, r.name,
              CASE WHEN r.playlist_masked ~* 'player_api|get\.php|username' THEN 'xtream' ELSE 'm3u' END,
              r.playlist_enc, r.playlist_masked, false, v_ceo)
      RETURNING id INTO v_pool;
    END IF;

    INSERT INTO public.user_source_access (user_id, source_id, is_default, granted_by)
    VALUES (r.user_id, v_pool, true, v_ceo)
    ON CONFLICT (user_id, source_id) DO NOTHING;
  END LOOP;

  -- 5c. Anyone with grants but no default gets their first grant as default
  FOR r IN
    SELECT user_id FROM public.user_source_access
    GROUP BY user_id HAVING bool_or(is_default) = false
  LOOP
    UPDATE public.user_source_access SET is_default = true
     WHERE id = (SELECT id FROM public.user_source_access
                  WHERE user_id = r.user_id ORDER BY created_at LIMIT 1);
  END LOOP;
END $$;