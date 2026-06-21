CREATE TABLE public.quran_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmarks text[] NOT NULL DEFAULT '{}',
  last_read jsonb,
  reciter text NOT NULL DEFAULT 'ar.alafasy',
  font_size integer NOT NULL DEFAULT 32,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quran_preferences TO authenticated;
GRANT ALL ON public.quran_preferences TO service_role;

ALTER TABLE public.quran_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quran preferences"
ON public.quran_preferences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_quran_preferences_updated_at
BEFORE UPDATE ON public.quran_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();