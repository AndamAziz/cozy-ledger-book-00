import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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
  playlistUrl: string;
  providerName: string | null;
}

/**
 * Live TV entitlement + the user's personal provider link.
 * Every account streams from its own credentials, so both are needed before
 * the player can be opened.
 */
export function useLiveTvAccess() {
  const { user, isLoading: authLoading } = useAuth();
  const [access, setAccess] = useState<LiveTvAccess | null>(null);
  const [server, setServer] = useState<LiveTvServer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) {
      setAccess(null);
      setServer(null);
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
      supabase
        .from('user_iptv_servers')
        .select('playlist_url, provider_name')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const row = accessRes.data;
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
    setServer(
      serverRes.data
        ? {
            playlistUrl: serverRes.data.playlist_url ?? '',
            providerName: serverRes.data.provider_name ?? null,
          }
        : { playlistUrl: '', providerName: null },
    );
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

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
    hasServer: !!server?.playlistUrl,
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
