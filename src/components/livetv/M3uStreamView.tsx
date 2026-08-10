import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  X, Loader2, AlertTriangle, SkipBack, SkipForward,
  Maximize2, RefreshCw, Signal, Search, Volume2, VolumeX,
  Play,
} from 'lucide-react';
import { ChannelLogo } from './ChannelLogo';
import { nativeHlsSupported, playWithAutoplayFallback, toggleFullscreen } from '@/lib/playback';
import { needsProxy, resolveStreamSource, type StreamHeaders } from '@/lib/streamHeaders';
import { TV_EVENT, remoteAction } from '@/lib/tvRemote';
import { isTvMode, markTvMode } from '@/lib/tvMode';
import { useVirtualList } from '@/hooks/useVirtualList';



const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iptv-m3u-proxy?url=`;

/** Fixed row metrics keep the virtual list maths exact. */
const ROW_HEIGHT = 56;
const ROW_GAP = 6;

export interface StreamChannel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
  /** Custom headers detected in the playlist; when present the stream is proxied. */
  headers?: StreamHeaders | null;
}


interface Props {
  channel: StreamChannel;
  channels: StreamChannel[];
  playlistName: string;
  ku: boolean;
  onSelect: (ch: StreamChannel) => void;
  onClose: () => void;
  /** Fired when the user taps the video area (used to reveal the top banner). */
  onVideoTap?: () => void;
}

export default function M3uStreamView({
  channel, channels, playlistName, ku, onSelect, onClose, onVideoTap,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [loadingStream, setLoadingStream] = useState(true);
  const [error, setError] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  /** Channel name shown in the big TV "zapping" toast (CH+/CH-, OK, list click). */
  const [zap, setZap] = useState<string | null>(null);


  const T = {
    upNext: ku ? 'کەناڵەکانی تر' : 'Up next',
    search: ku ? 'گەڕان...' : 'Search...',
    live: ku ? 'ڕاستەوخۆ' : 'LIVE',
    loading: ku ? 'پەیوەندی بە کەناڵەوە...' : 'Connecting to stream...',
    error: ku ? 'ئەم کەناڵە کار ناکات، کەناڵێکی تر تاقی بکەرەوە' : 'This channel is unavailable, try another',
    retry: ku ? 'دووبارە' : 'Retry',
    prev: ku ? 'پێشوو' : 'Previous',
    next: ku ? 'دواتر' : 'Next',
    close: ku ? 'داخستن' : 'Close',
    none: ku ? 'هیچ کەناڵێک نەدۆزرایەوە' : 'No channels found',
    switching: ku ? 'گوێزانەوەی کەناڵ...' : 'Switching channel...',
    nowPlaying: ku ? 'ئێستا' : 'Now playing',
  };

  const [orderedChannels, setOrderedChannels] = useState(channels);

  useEffect(() => {
    setOrderedChannels((prev) => {
      const same = prev.length === channels.length && prev.every((c, i) => c.url === channels[i].url);
      return same ? prev : channels;
    });
  }, [channels]);

  useEffect(() => {
    setOrderedChannels((prev) => {
      const idx = prev.findIndex((c) => c.url === channel.url);
      if (idx <= 0) return prev;
      return [prev[idx], ...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, [channel.url]);

  const index = useMemo(
    () => orderedChannels.findIndex((c) => c.url === channel.url),
    [orderedChannels, channel.url],
  );

  const step = (delta: number) => {
    if (!orderedChannels.length) return;
    const next = orderedChannels[(index + delta + orderedChannels.length) % orderedChannels.length];
    if (!next) return;
    setZap(next.name);
    onSelect(next);
  };


  const retry = useCallback(() => {
    setError(false);
    setLoadingStream(true);
    setUseProxy(false);
    setAttempt((a) => a + 1);
  }, []);

  /**
   * Channels that declare custom headers in the playlist must go through the
   * proxy from the very first attempt (a browser cannot send Referer/UA).
   * Everything else plays direct, with the proxy only as a fallback.
   */
  const requiresProxy = needsProxy(channel.headers);
  const headerKey = requiresProxy ? JSON.stringify(channel.headers) : '';

  /* playback engine — direct source first, proxy as automatic fallback */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    // Every (re)start of playback clears any stale error from a previous channel.
    setError(false);
    setLoadingStream(true);

    const src = resolveStreamSource(channel.url, channel.headers, PROXY_BASE, useProxy);
    const exhausted = useProxy || requiresProxy;
    const fail = () => {
      if (cancelled) return;
      if (!exhausted) setUseProxy(true);
      else {
        setLoadingStream(false);
        setError(true);
      }
    };


    // Safari / iOS / Smart TVs play HLS natively (hardware decode, HEVC, AC-3);
    // everywhere else hls.js is required — including for extensionless IPTV
    // manifest URLs, which Chrome/Firefox cannot play on their own.
    const native = nativeHlsSupported();
    const looksProgressive = /\.(mp4|mkv|webm|mov|m4v)(\?|$)/i.test(channel.url);
    const useHlsJs = !native && !looksProgressive && Hls.isSupported();

    if (useHlsJs) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setLoadingStream(false);
        setError(false);
        playWithAutoplayFallback(video, () => setMuted(true)).catch(() => {});
      });
      // Proxied live feeds (Referer-protected channels, rolling segment windows)
      // occasionally hit a transient network/media fault. Recovering in place is
      // far more reliable than tearing the engine down on the first hiccup.
      let recoveries = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || cancelled) return;
        if (recoveries < 3) {
          recoveries += 1;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            recoveries <= 2 ? hls.recoverMediaError() : hls.swapAudioCodec();
          } else {
            hls.stopLoad();
            hls.loadSource(src);
            hls.startLoad();
          }
          return;
        }
        hls.destroy();
        fail();
      });
    } else {
      video.src = src;
      playWithAutoplayFallback(video, () => setMuted(true))
        .then(() => {
          if (cancelled) return;
          setLoadingStream(false);
          setError(false);
        })
        .catch(fail);
    }

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [channel.url, headerKey, useProxy, attempt]);


  /* reset the proxy fallback whenever the user switches channel */
  useEffect(() => {
    setUseProxy(false);
  }, [channel.url]);

  /* TV zapping toast: always show the channel we switched to, then fade out */
  useEffect(() => {
    setZap(channel.name);
    const t = setTimeout(() => setZap(null), 2600);
    return () => clearTimeout(t);
  }, [channel.url, channel.name]);


  /* keyboard shortcuts (arrows are reserved for D-pad focus navigation) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, channels]);

  /* Smart TV remote: CH+/CH- zapping, play/pause, mute and Back. */
  useEffect(() => {
    const video = () => videoRef.current;
    const handlers: Record<string, (e: Event) => void> = {
      [TV_EVENT.channelUp]: (e) => {
        e.preventDefault();
        step(1);
      },
      [TV_EVENT.channelDown]: (e) => {
        e.preventDefault();
        step(-1);
      },
      [TV_EVENT.playPause]: (e) => {
        e.preventDefault();
        const v = video();
        if (!v) return;
        v.paused ? v.play().catch(() => undefined) : v.pause();
      },
      [TV_EVENT.mute]: (e) => {
        e.preventDefault();
        setMuted((m) => !m);
      },
      [TV_EVENT.stop]: (e) => {
        e.preventDefault();
        onClose();
      },
      [TV_EVENT.back]: (e) => {
        e.preventDefault();
        onClose();
      },
    };
    for (const [name, fn] of Object.entries(handlers)) window.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of Object.entries(handlers)) window.removeEventListener(name, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, channels, onClose]);

  const goFullscreen = () => {
    // iPhone can only fullscreen the video element itself; legacy WebKit and
    // Smart TV browsers need the prefixed APIs.
    toggleFullscreen(shellRef.current, videoRef.current);
  };


  // Debounced so typing in a 40k-channel playlist doesn't re-filter per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(t);
  }, [query]);

  // Full list (no cap) — only the visible rows are rendered, see useVirtualList.
  // The currently selected channel is always pinned to the top of the list.
  const list = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return q ? orderedChannels.filter((c) => c.name.toLowerCase().includes(q)) : orderedChannels;
  }, [orderedChannels, debouncedQuery]);

  const rows = useVirtualList(list.length, { rowHeight: ROW_HEIGHT, gap: ROW_GAP });
  useEffect(() => {
    rows.scrollToTop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  /* top bar stays permanently visible — slim enough to never cover the picture */
  const revealBar = () => {
    onVideoTap?.();
  };


  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Row index the remote last activated — refocused after the list re-renders. */
  const focusIndexRef = useRef<number | null>(null);

  /**
   * Pick a channel from the list. On a TV the D-pad focus must survive the
   * re-render (the virtual list re-creates its rows), so we restore focus onto
   * the same row instead of scrolling the picture into view.
   */
  const handleSelect = (c: StreamChannel, rowIndex?: number) => {
    const tv = isTvMode();
    const active = document.activeElement as HTMLElement | null;
    const fromDom = Number(active?.getAttribute?.('data-ch-row') ?? NaN);
    const idx = typeof rowIndex === 'number' ? rowIndex : Number.isFinite(fromDom) ? fromDom : null;
    if (tv && idx !== null) focusIndexRef.current = idx;
    onSelect(c);

    requestAnimationFrame(() => {
      if (tv) {
        const idx = focusIndexRef.current;
        if (idx !== null) {
          document.querySelector<HTMLElement>(`[data-ch-row="${idx}"]`)?.focus({ preventScroll: true });
        }
        return;
      }
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };



  return createPortal(
    <div data-tv-scope className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-background">
      <div
        ref={scrollRef}
        className="relative mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 overflow-y-auto p-3 md:p-6 lg:flex-row lg:gap-6 lg:overflow-hidden"
      >
        {/* Player */}
        <div className="flex min-w-0 flex-col lg:flex-1">
          {/* Slim permanent top bar — above the video, never over it */}
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/40 px-1.5 py-1 backdrop-blur md:px-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label={T.close}
              className="h-7 w-7 shrink-0 rounded-full hover:bg-foreground/10"
            >
              <X className="h-4 w-4" />
            </Button>
            <p className="min-w-0 flex-1 truncate text-[12px] font-bold leading-none text-foreground md:text-sm">
              {channel.name}
            </p>

            <Badge variant="destructive" className="h-4 shrink-0 px-1.5 text-[9px] leading-none">
              <Signal className="me-1 h-2.5 w-2.5" /> {T.live}
            </Badge>
          </div>
          <div
            ref={shellRef}
            onPointerDown={revealBar}
            onMouseMove={revealBar}
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/50 bg-black shadow-2xl md:rounded-2xl"
          >




            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              muted={muted}
              onPlaying={() => {
                setError(false);
                setLoadingStream(false);
              }}
              className="h-full w-full bg-black"
            />

            {loadingStream && !error && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-[11px] font-semibold text-white/80">{T.loading}</p>
              </div>
            )}

            {/* Zapping / now-playing banner — large enough to read across a room */}
            {zap && !error && (
              <div
                data-zap-banner
                className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center p-3"
              >
                <div className="flex max-w-full items-center gap-2 rounded-lg border border-primary/50 bg-black/75 px-3 py-2 shadow-lg">
                  {loadingStream ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Signal className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-primary">
                      {loadingStream ? T.switching : T.nowPlaying}
                    </span>
                    <span className="block truncate text-sm font-bold text-white md:text-base">
                      {String(index + 1).padStart(2, '0')} · {zap}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
                <AlertTriangle className="h-7 w-7 text-destructive" />
                <p className="text-xs font-semibold text-white">{T.error}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={retry}>
                    <RefreshCw className="me-1.5 h-3.5 w-3.5" />
                    {T.retry}
                  </Button>
                  <Button size="sm" onClick={() => step(1)}>
                    <SkipForward className="me-1.5 h-3.5 w-3.5" />
                    {T.next}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => step(-1)}>
              <SkipBack className="me-1.5 h-3.5 w-3.5" />
              {T.prev}
            </Button>
            <Button size="sm" variant="outline" onClick={() => step(1)}>
              <SkipForward className="me-1.5 h-3.5 w-3.5" />
              {T.next}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMuted((m) => !m)} aria-label="mute">
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="outline" onClick={retry}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="secondary" className="ms-auto" onClick={goFullscreen}>
              <Maximize2 className="me-1.5 h-3.5 w-3.5" />
              HD
            </Button>
          </div>
        </div>

        {/* Channel stream list */}
        <div className="flex min-h-0 flex-col gap-2 lg:w-80 lg:shrink-0 lg:rounded-2xl lg:border lg:border-border/50 lg:bg-card/40 lg:p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.search}
              className="h-9 ps-9 text-sm"
            />
          </div>
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {T.upNext} · {orderedChannels.length}
          </p>
          {/* Virtualised list: only the rows in view exist in the DOM. */}
          <div
            ref={rows.scrollRef}
            className="max-h-[52vh] min-h-[220px] overflow-y-auto lg:max-h-none lg:min-h-0 lg:flex-1 lg:pe-1"
          >
            {list.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{T.none}</p>
            ) : (
              <div style={rows.spacerStyle}>
                <div style={rows.offsetStyle}>
                  {list.slice(rows.start, rows.end).map((c, i) => {
                    const index = rows.start + i;
                    const active = c.url === channel.url;
                    return (
                      <button
                        key={`${c.url}-${index}`}
                        type="button"
                        data-ch-row={index}
                        data-active={active ? 'true' : undefined}
                        aria-current={active ? 'true' : undefined}
                        aria-busy={active && loadingStream ? 'true' : undefined}
                        onClick={() => handleSelect(c, index)}
                        // TV remotes are inconsistent: some send OK as keyCode 13
                        // with an empty `key`, Android TV sends 23, Fire TV sends
                        // Space. Handle every variant explicitly on the row.
                        onKeyDown={(e) => {
                          const action = remoteAction(e.nativeEvent);
                          if (action !== 'ok') return;
                          e.preventDefault();
                          e.stopPropagation();
                          markTvMode();
                          handleSelect(c, index);
                        }}
                        style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
                        className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg border p-2 text-start transition-all duration-300 ease-out focus:outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          active
                            ? 'z-10 scale-[1.02] border-primary/80 bg-gradient-to-r from-primary/30 via-primary/15 to-transparent shadow-[0_0_24px_-6px_hsl(var(--primary)/0.45)] ring-2 ring-primary/70'
                            : 'border-border/50 bg-card hover:border-primary/40 hover:bg-primary/[0.06]'
                        }`}
                      >
                        {/* Active left accent bar */}
                        {active && (
                          <span className="pointer-events-none absolute inset-y-2 left-0 w-1 rounded-full bg-gradient-to-b from-primary via-emerald-400 to-primary" />
                        )}

                        <ChannelLogo
                          name={c.name}
                          logo={c.logo}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg ${
                            active ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-muted/50'
                          }`}
                        />

                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-xs font-bold ${active ? 'text-primary' : 'text-foreground'}`}>
                            {c.name}
                          </span>
                          {active && (
                            <span className="flex items-center gap-1 truncate text-[10px] font-semibold text-primary/80">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary))]" />
                              {loadingStream ? T.switching : T.nowPlaying}
                            </span>
                          )}
                        </span>

                        {active && !loadingStream && (
                          <Play className="h-4 w-4 shrink-0 text-primary" fill="currentColor" />
                        )}
                        {active && loadingStream ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <span
                            className={`flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-bold ${
                              active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {String(index + 1).padStart(2, '0')}
                          </span>
                        )}
                      </button>

                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
