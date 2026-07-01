import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Radio, X, RefreshCw, Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { useStreamServers, type StreamStatus, type StreamServer } from '@/hooks/useStreamServers';

interface SportLivePlayerProps {
  open: boolean;
  onClose: () => void;
}

const STREAM_REVEAL_TIMEOUT_MS = 2500;
const FAILOVER_DEBOUNCE_MS = 1200;
const ACTIVE_SERVER_KEY = 'ctp-sport-active-server';

const STATUS_META: Record<StreamStatus, { label: string; dot: string; text: string }> = {
  live: { label: 'Live', dot: 'bg-success', text: 'text-success' },
  slow: { label: 'Slow', dot: 'bg-warning', text: 'text-warning' },
  offline: { label: 'Offline', dot: 'bg-destructive', text: 'text-destructive' },
  checking: { label: 'Ready', dot: 'bg-success/70', text: 'text-muted-foreground' },
};

type PlaybackMode = 'iframe' | 'hls' | 'video';

function getPlaybackMode(url: string): PlaybackMode {
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.m3u8')) return 'hls';
  if (/\.(mp4|webm|ogg|ogv|mov|m4v|ts|mkv)$/.test(cleanUrl)) return 'video';
  return 'iframe';
}

function DirectStreamVideo({
  server,
  mode,
  onReady,
  onError,
}: {
  server: StreamServer;
  mode: Exclude<PlaybackMode, 'iframe'>;
  onReady: () => void;
  onError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hlsInstance: { destroy: () => void } | null = null;
    let cancelled = false;

    const playQuietly = () => {
      video.play().catch(() => {
        // Browser autoplay rules may require the user to tap play; keep controls visible.
      });
    };

    if (mode === 'hls') {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hlsInstance = hls;
            hls.loadSource(server.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, playQuietly);
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data?.fatal) onError();
            });
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = server.url;
            playQuietly();
          } else {
            onError();
          }
        })
        .catch(onError);
    } else {
      video.src = server.url;
      playQuietly();
    }

    return () => {
      cancelled = true;
      hlsInstance?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [mode, onError, onReady, server.url]);

  return (
    <video
      ref={videoRef}
      title={server.name}
      controls
      autoPlay
      playsInline
      muted={false}
      preload="auto"
      onCanPlay={onReady}
      onPlaying={onReady}
      onError={onError}
      className="absolute inset-0 h-full w-full bg-black object-contain"
    />
  );
}

export function SportLivePlayer({ open, onClose }: SportLivePlayerProps) {
  const { servers, statuses, latencies, isLoading, runHealthCheck, markStatus, refetch } =
    useStreamServers(open);

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(ACTIVE_SERVER_KEY);
  });
  const [iframeLoading, setIframeLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [allOffline, setAllOffline] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptedRef = useRef<Set<string>>(new Set());

  const orderedServers = useMemo(
    () => [...servers].sort((a, b) => a.priority - b.priority),
    [servers],
  );

  const clearLoadTimer = () => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  };

  // Pick the best server: lowest priority that is not marked offline and not already tried.
  const pickNextServer = useCallback(
    (excludeId?: string): StreamServer | null => {
      const candidates = orderedServers.filter(
        (s) =>
          s.id !== excludeId &&
          statuses[s.id] !== 'offline' &&
          !attemptedRef.current.has(s.id),
      );
      if (candidates.length > 0) return candidates[0];
      // Fallback: any non-offline server even if already attempted (avoids dead-lock).
      const relaxed = orderedServers.filter(
        (s) => s.id !== excludeId && statuses[s.id] !== 'offline',
      );
      if (relaxed.length > 0) return relaxed[0];
      // Last resort: some hosts block server-side probes (bot protection) but still
      // play inside a browser iframe. Give the iframe a chance rather than giving up.
      const untried = orderedServers.filter(
        (s) => s.id !== excludeId && !attemptedRef.current.has(s.id),
      );
      return untried[0] ?? null;
    },
    [orderedServers, statuses],
  );

  const switchTo = useCallback((server: StreamServer | null) => {
    if (!server) {
      setAllOffline(true);
      setIframeLoading(false);
      setSwitching(false);
      return;
    }
    setAllOffline(false);
    setSwitching(true);
    setIframeLoading(true);
    attemptedRef.current.add(server.id);
    setActiveId(server.id);
  }, []);

  // Debounced failover to avoid flicker loops if several servers fail at once.
  const triggerFailover = useCallback(
    (failedId: string) => {
      markStatus(failedId, 'offline');
      if (failoverTimerRef.current) clearTimeout(failoverTimerRef.current);
      failoverTimerRef.current = setTimeout(() => {
        const next = pickNextServer(failedId);
        switchTo(next);
      }, FAILOVER_DEBOUNCE_MS);
    },
    [markStatus, pickNextServer, switchTo],
  );

  // Initial server selection once the list loads.
  useEffect(() => {
    if (!open) return;
    if (activeId) return;
    if (orderedServers.length === 0) return;
    attemptedRef.current = new Set();
    const first = pickNextServer();
    switchTo(first);
  }, [open, activeId, orderedServers, pickNextServer, switchTo]);

  // Reset all local state when closed.
  useEffect(() => {
    if (open) return;
    clearLoadTimer();
    if (failoverTimerRef.current) clearTimeout(failoverTimerRef.current);
    setActiveId(null);
    setIframeLoading(true);
    setSwitching(false);
    setAllOffline(false);
    attemptedRef.current = new Set();
  }, [open]);

  // Reveal iframe pages after a short grace period. Some movie/stream hosts keep
  // loading scripts for a long time, so timeout must NOT mark the server offline.
  useEffect(() => {
    if (!open || !activeId) return;
    clearLoadTimer();
    loadTimerRef.current = setTimeout(() => {
      setIframeLoading(false);
      setSwitching(false);
    }, STREAM_REVEAL_TIMEOUT_MS);
    return clearLoadTimer;
  }, [open, activeId, reloadNonce]);

  const handleIframeLoad = useCallback(() => {
    try {
      clearLoadTimer();
      setIframeLoading(false);
      if (activeId) markStatus(activeId, 'live');
      // Give the cross-fade a beat to finish.
      setTimeout(() => setSwitching(false), 350);
    } catch (err) {
      console.error('iframe load handler error:', err);
    }
  }, [activeId, markStatus]);

  const handleIframeError = useCallback(() => {
    try {
      if (activeId) triggerFailover(activeId);
    } catch (err) {
      console.error('iframe error handler error:', err);
    }
  }, [activeId, triggerFailover]);

  const handleManualRetry = useCallback(() => {
    attemptedRef.current = new Set();
    setAllOffline(false);
    setIframeLoading(true);
    setSwitching(false);
    setReloadNonce((n) => n + 1);
    refetch();
  }, [refetch]);

  const activeServer = orderedServers.find((s) => s.id === activeId) ?? null;
  const playbackMode = activeServer ? getPlaybackMode(activeServer.url) : 'iframe';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col no-print">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-success to-success/80 flex items-center justify-center shadow-[0_0_14px_hsl(var(--success)/0.5)]">
            <Radio className="h-4 w-4 text-success-foreground" />
          </div>
          <span className="font-bold text-foreground text-sm">Sport Live</span>
          {activeServer && (
            <span className="hidden sm:inline text-xs text-muted-foreground">
              · {activeServer.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleManualRetry}
            className="w-8 h-8 rounded-lg bg-secondary/60 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors touch-manipulation active:scale-95"
            aria-label="Reload stream"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors touch-manipulation active:scale-95"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Player area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-2 sm:p-4">
          <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-[0_0_40px_hsl(var(--success)/0.15)] aspect-video">
            {/* The stream iframe */}
            {activeServer && !allOffline && playbackMode === 'iframe' && (
              <iframe
                key={`${activeServer.id}-${reloadNonce}`}
                title="Sport Live"
                src={activeServer.url}
                allowFullScreen
                scrolling="no"
                allow="fullscreen *; autoplay *; encrypted-media *; picture-in-picture *; web-share; clipboard-write; accelerometer; gyroscope"
                referrerPolicy="no-referrer-when-downgrade"
                // No `sandbox` attribute: matches the standalone player that loads every
                // provider (fastimdb, alba-player, HLS embeds, etc.). A sandbox breaks
                // many stream/movie hosts because their players need unrestricted
                // same-origin script + storage access to start playback.
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
                  iframeLoading || switching ? 'opacity-0' : 'opacity-100'
                }`}
              />
            )}


            {activeServer && !allOffline && playbackMode !== 'iframe' && (
              <DirectStreamVideo
                key={`${activeServer.id}-${reloadNonce}`}
                server={activeServer}
                mode={playbackMode}
                onReady={handleIframeLoad}
                onError={handleIframeError}
              />
            )}

            {/* Loading animation before first frame */}
            {(iframeLoading || switching) && !allOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-background via-background/95 to-secondary/40">
                <div className="relative">
                  <div className="w-14 h-14 rounded-full border-2 border-success/20" />
                  <Loader2 className="absolute inset-0 m-auto h-8 w-8 text-success animate-spin" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {switching ? 'Switching to backup server…' : 'Connecting to stream…'}
                </p>
                {activeServer && (
                  <p className="text-xs text-muted-foreground">{activeServer.name}</p>
                )}
              </div>
            )}

            {/* Fallback overlay while failing over */}
            {switching && !iframeLoading && !allOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm animate-fade-in">
                <AlertTriangle className="h-8 w-8 text-warning" />
                <p className="text-sm font-medium text-foreground text-center px-4">
                  Current stream unavailable. Switching to backup server…
                </p>
              </div>
            )}

            {/* All offline state */}
            {allOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-background via-background to-destructive/10 px-4">
                <div className="w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center">
                  <WifiOff className="h-7 w-7 text-destructive" />
                </div>
                <p className="text-base font-bold text-foreground text-center">
                  All servers currently offline
                </p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  We couldn't reach any live stream right now. Please try again in a moment.
                </p>
                <button
                  onClick={handleManualRetry}
                  className="mt-1 inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-success to-success/80 px-5 py-2.5 text-sm font-bold text-success-foreground shadow-[0_0_20px_hsl(var(--success)/0.4)] transition-transform active:scale-95"
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              </div>
            )}

            {/* Empty (no servers configured) */}
            {!isLoading && orderedServers.length === 0 && !allOffline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
                <WifiOff className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  No stream servers configured yet.
                </p>
              </div>
            )}
          </div>

          {/* Server status list */}
          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Servers
              </span>
              <span className="text-[10px] text-muted-foreground">
                Tap a server to switch
              </span>
            </div>
            {orderedServers.map((s) => {
              const st: StreamStatus = statuses[s.id] ?? 'checking';
              const meta = STATUS_META[st];
              const isActive = s.id === activeId;
              const latency = latencies[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    attemptedRef.current = new Set();
                    switchTo(s);
                  }}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition-all touch-manipulation active:scale-[0.99] ${
                    isActive
                      ? 'border-success/50 bg-success/10 shadow-[0_0_18px_hsl(var(--success)/0.15)]'
                      : 'border-white/10 bg-secondary/30 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                    <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                    {isActive && (
                      <span className="text-[10px] font-bold text-success flex-shrink-0">
                        · watching
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {typeof latency === 'number' && st !== 'offline' && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {latency}ms
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${meta.text} flex items-center gap-1`}>
                      {st === 'offline' ? (
                        <WifiOff className="h-3 w-3" />
                      ) : (
                        <Wifi className="h-3 w-3" />
                      )}
                      {meta.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
