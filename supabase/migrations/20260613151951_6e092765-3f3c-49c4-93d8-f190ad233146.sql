ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS consecutive_losses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paused boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bot_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  pnl numeric,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_notifications TO authenticated;
GRANT ALL ON public.bot_notifications TO service_role;

ALTER TABLE public.bot_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own notifications"
  ON public.bot_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own notifications"
  ON public.bot_notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own notifications"
  ON public.bot_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own notifications"
  ON public.bot_notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bot_notifications_user
  ON public.bot_notifications (user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_notifications;