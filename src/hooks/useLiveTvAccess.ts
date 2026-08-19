import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isCeoEmail } from '@/lib/ceo';


export interface LiveTvAccess {
  trialEndsAt: string | null;
  isActivated: boolean;
  /** Trial still running or account paid for. */
  hasAccess: boolean;
  /** Trial window has passed and no activation was purchased. */
  trialExpired: boolean;
  msLeft: number;
}

export interface LiveTvServer {
  /** Redacted preview only — the real credentials never reach the browser. */
  masked: string;
  providerName: string | null;
  updatedAt: string | null;
}

/**
 * Live TV entitlement + the user's personal provider link.
 *
 * Entitlement is read from `livetv_access` (with a realtime subscription so
 * activation/trial changes land instantly). The provider link is NEVER read
 * from the database by the client: it is encrypted at rest and only a masked
 * preview is returned by the `iptv-server` edge function.
 */
export function useLiveTvAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const [access, setAccess] = useState<LiveTvAccess | null>(null);
  const [server, setServer] = useState<LiveTvServer | null>(null);
  const [hasServer, setHasServer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const applyAccessRow = useCallback(
    (row: { trial_ends_at?: string | null; is_activated?: boolean | null } | null) => {
      const trialEndsAt = row?.trial_ends_at ?? null;
      const isActivated = !!row?.is_activated;
      const trialLive = !!trialEndsAt && new Date(trialEndsAt).getTime() > Date.now();
      setAccess({
        trialEndsAt,
        isActivated,
        hasAccess: isActivated || trialLive,
        trialExpired: !isActivated && !trialLive,
        msLeft: trialEndsAt ? Math.max(0, new Date(trialEndsAt).getTime() - Date.now()) : 0,
      });
    },
    [],
  );

  const load = useCallback(async () => {
    if (!user) {
      setAccess(null);
      setServer(null);
      setHasServer(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [accessRes, serverRes] = await Promise.all([
      supabase
        .from('livetv_access')
        .select('trial_ends_at, is_activated')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.functions.invoke('iptv-server', { body: { action: 'get' } }),
    ]);

    applyAccessRow(accessRes.data ?? null);

    const info = serverRes.data as
      | { hasServer?: boolean; masked?: string; providerName?: string | null; updatedAt?: string | null }
      | null;
    setHasServer(!!info?.hasServer);
    setServer({
      masked: info?.masked ?? '',
      providerName: info?.providerName ?? null,
      updatedAt: info?.updatedAt ?? null,
    });
    setIsLoading(false);
  }, [user, applyAccessRow]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  // Realtime entitlement: activation via Stripe or an admin change lands live.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`livetv-access-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'livetv_access',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { trial_ends_at?: string | null; is_activated?: boolean | null };
          if (row) applyAccessRow(row);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, applyAccessRow]);

  // Keeps the trial countdown ticking and flips the gate the moment it ends.
  useEffect(() => {
    if (!access?.trialEndsAt || access.isActivated) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [access?.trialEndsAt, access?.isActivated]);

  const msLeft = access?.trialEndsAt
    ? Math.max(0, new Date(access.trialEndsAt).getTime() - now)
    : 0;

  const live = access
    ? {
        ...access,
        msLeft,
        hasAccess: access.isActivated || msLeft > 0,
        trialExpired: !access.isActivated && msLeft <= 0,
      }
    : null;

  return {
    user,
    access: live,
    server,
    hasServer,
    isLoading: authLoading || isLoading,
    refresh: load,
  };
}

/** "23h 41m" / "41m 08s" style countdown for the trial banner. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, '0')}m`
    : `${m}m ${String(s).padStart(2, '0')}s`;
}
