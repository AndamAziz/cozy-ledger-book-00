import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Hls from 'hls.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  X, Loader2, AlertTriangle, SkipBack, SkipForward,
  Maximize2, RefreshCw, Signal, Search, Volume2, VolumeX,
} from 'lucide-react';
import { ChannelLogo } from './ChannelLogo';
import { nativeHlsSupported, playWithAutoplayFallback, toggleFullscreen } from '@/lib/playback';



const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iptv-m3u-proxy?url=`;

export interface StreamChannel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
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
  };

  const index = useMemo(
    () => channels.findIndex((c) => c.url === channel.url),
    [channels, channel.url],
  );

  const step = (delta: number) => {
    if (!channels.length) return;
    const next = channels[(index + delta + channels.length) % channels.length];
    if (next) onSelect(next);
  };

  const retry = useCallback(() => {
    setError(false);
    setLoadingStream(true);
    setUseProxy(false);
    setAttempt((a) => a + 1);
  }, []);

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

    const src = useProxy ? `${PROXY_BASE}${encodeURIComponent(channel.url)}` : channel.url;
    const fail = () => {
      if (cancelled) return;
      if (!useProxy) setUseProxy(true);
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
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          hls.destroy();
          fail();
        }
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
  }, [channel.url, useProxy, attempt]);


  /* reset the proxy fallback whenever the user switches channel */
  useEffect(() => {
    setUseProxy(false);
  }, [channel.url]);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, channels]);

  const goFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 200);
  }, [channels, query]);

  /* top bar auto-hide */
  const [barOpen, setBarOpen] = useState(true);
  useEffect(() => {
    if (!barOpen) return;
    const t = setTimeout(() => setBarOpen(false), 4000);
    return () => clearTimeout(t);
  }, [barOpen]);
  const revealBar = () => {
    setBarOpen(true);
    onVideoTap?.();
  };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** pick a channel from the list and bring the player back into view */
  const handleSelect = (c: StreamChannel) => {
    onSelect(c);
    setBarOpen(true);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      shellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };


  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col overscroll-contain bg-background">
      <div
        ref={scrollRef}
        className="relative mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4 overflow-y-auto p-3 md:p-6 lg:flex-row lg:gap-6 lg:overflow-hidden"
      >
        {/* Player */}
        <div className="flex min-w-0 flex-col lg:flex-1">
          <div
            ref={shellRef}
            onPointerDown={revealBar}
            onMouseMove={revealBar}
            className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/50 bg-black shadow-2xl md:rounded-2xl"
          >
            {/* Top bar — overlays the video, auto-hides, returns on tap / mouse move */}
            {barOpen && (
              <div className="absolute inset-x-0 top-0 z-20 flex animate-fade-in items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-2 py-2 md:px-4">
                <Button variant="ghost" size="icon" onClick={onClose} aria-label={T.close} className="text-white hover:bg-white/10">
                  <X className="h-5 w-5" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-white md:text-base">{channel.name}</p>
                  <p className="truncate text-[11px] text-white/70">
                    {playlistName} · {channel.group}
                  </p>
                </div>
                <Badge variant="destructive" className="text-[10px]">
                  <Signal className="me-1 h-3 w-3" /> {T.live}
                </Badge>
              </div>
            )}


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
            {T.upNext} · {channels.length}
          </p>
          <div className="space-y-1.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pe-1">

            {list.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">{T.none}</p>
            )}
            {list.map((c, i) => (
              <button
                key={`${c.url}-${i}`}
                type="button"
                onClick={() => handleSelect(c)}
                className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-start transition ${
                  c.url === channel.url
                    ? 'border-primary bg-primary/10'
                    : 'border-border/50 bg-card hover:border-primary/40'
                }`}
              >
                <ChannelLogo name={c.name} logo={c.logo} />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold">{c.name}</span>
                </span>
                <span className="flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-md bg-muted px-1 text-[10px] font-bold text-muted-foreground">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
