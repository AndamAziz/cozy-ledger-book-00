CREATE TABLE public.stream_servers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_status text NOT NULL DEFAULT 'checking',
  last_latency_ms integer,
  fail_count integer NOT NULL DEFAULT 0,
  auto_disabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stream_servers TO anon, authenticated;
GRANT ALL ON public.stream_servers TO service_role;

ALTER TABLE public.stream_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active streams"
  ON public.stream_servers FOR SELECT
  USING (is_active = true OR public.is_ceo());

CREATE POLICY "CEO can insert streams"
  ON public.stream_servers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_ceo());

CREATE POLICY "CEO can update streams"
  ON public.stream_servers FOR UPDATE
  TO authenticated
  USING (public.is_ceo())
  WITH CHECK (public.is_ceo());

CREATE POLICY "CEO can delete streams"
  ON public.stream_servers FOR DELETE
  TO authenticated
  USING (public.is_ceo());

CREATE TRIGGER update_stream_servers_updated_at
  BEFORE UPDATE ON public.stream_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.stream_servers (name, url, priority, is_active) VALUES
  ('Server 1', 'https://ex.roooom.online/?alba-player=home2&serv=0', 1, true),
  ('Server 2', 'https://ex.roooom.online/?alba-player=home2&serv=1', 2, true),
  ('Server 3', 'https://ex.roooom.online/?alba-player=home2&serv=2', 3, true),
  ('Server 4', 'https://ex.roooom.online/?alba-player=home2&serv=3', 4, true),
  ('Server 5', 'https://ex.roooom.online/?alba-player=home2&serv=4', 5, true);