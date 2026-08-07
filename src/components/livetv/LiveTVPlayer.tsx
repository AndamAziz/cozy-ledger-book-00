import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X, Loader2, AlertTriangle, Maximize2, Minimize2, Settings2, RefreshCw,
  Play, Pause, Volume2, VolumeX,
} from 'lucide-react';
import { toPlayableUrl, type IptvChannel, type IptvEpisode } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { useLogoFallback } from '@/lib/logoFallback';
import {
  nativeHlsSupported, playWithAutoplayFallback, toggleFullscreen,
  onFullscreenChange, fullscreenElement,
} from '@/lib/playback';





interface QualityLevel {
  /** hls.js level index, or -1 for auto */
  index: number;
  label: string;
}

/** Bucket a level height into a friendly label. */
function labelForLevel(height?: number, bitrate?: number): string {
  if (height && height > 0) return `${height}p`;
  if (bitrate) return `${Math.round(bitrate / 1000)}kbps`;
  return 'Auto';
}

interface Props {
  channel: IptvChannel;
  onClose: () => void;
  /** Episodes of the current season — renders an inline switcher under the video. */
  episodes?: IptvEpisode[];
  currentEpisodeId?: string;
  onSelectEpisode?: (episode: IptvEpisode) => void;
  /** Kept for API compatibility with callers. */
  onSlotLimit?: () => void;
}

/**
 * Playback mirrors the proven IPTV M3U module: one hls.js instance with a lean
 * config, a native <video src> fallback, and nothing else. No engine chains,
 * watchdogs or retry loops — those caused the stalls this player used to hit.
 */
export function LiveTVPlayer({
  channel,
  onClose,
  episodes,
  currentEpisodeId,
  onSelectEpisode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nativeMode, setNativeMode] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [autoLabel, setAutoLabel] = useState<string | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFull, setIsFull] = useState(false);
  const isLive = (channel.kind ?? 'live') === 'live';


  const accent = accentFor(channel.name);
  const headerLogo = useLogoFallback(channel.logo);


  // New channel / episode → back to the preferred engine and show the top bar.
  useEffect(() => {
    setNativeMode(false);
    setAttempt(0);
    setLevels([]);
    setSelectedLevel(-1);
    setAutoLabel(null);
    setBarOpen(true);
    setQualityOpen(false);
  }, [channel.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Destroying hls.js is guarded: a throw here used to bubble up, hit the
    // error boundary and tear the whole player down mid-playback.
    const safeDestroy = () => {
      const inst = hlsRef.current;
      hlsRef.current = null;
      if (!inst) return;
      try {
        inst.destroy();
      } catch (err) {
        console.warn('hls destroy failed', err);
      }
    };

    safeDestroy();

    setLoading(true);
    setError(false);

    const src = toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext);
    const done = () => setLoading(false);
    const onMediaError = () => {
      setLoading(false);
      setError(true);
    };

    video.addEventListener('playing', done);
    video.addEventListener('canplay', done);
    video.addEventListener('loadeddata', done);

    // Movies / episodes are progressive containers (mp4, mkv…): hls.js cannot
    // parse them, so they play natively — exactly like the IPTV M3U module,
    // which only engages hls.js for HLS manifests. Safari/iOS and Smart TV
    // browsers also decode HLS natively (hardware HEVC/AC-3), so hls.js is only
    // used where native HLS is missing (Chrome, Edge, Firefox, Android WebView).
    const isHls = (channel.kind ?? 'live') === 'live';
    let disposed = false;

    if (!nativeMode && isHls && !nativeHlsSupported() && Hls.isSupported()) {

      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20 });
      hlsRef.current = hls;
      let recovered = 0;
      try {
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch (err) {
        console.warn('hls init failed', err);
        safeDestroy();
        setNativeMode(true);
        return;
      }
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLoading(false);
        setLevels(
          (data.levels ?? []).map((l, i) => ({ index: i, label: labelForLevel(l.height, l.bitrate) })),
        );
        video.play().catch(() => undefined);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const lvl = hls.levels?.[data.level];
        if (lvl) setAutoLabel(labelForLevel(lvl.height, lvl.bitrate));
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        // Try in-place recovery first (network hiccup / decoder glitch) so a
        // brief drop no longer kills the session.
        if (recovered < 2) {
          recovered += 1;
          try {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
          } catch (err) {
            console.warn('hls recovery failed', err);
          }
        }
        // Never destroy synchronously inside the handler — hls.js is still on
        // the stack and throwing there crashed the player.
        setTimeout(() => {
          if (disposed) return;
          safeDestroy();
          setNativeMode(true);
        }, 0);
      });
    } else {
      video.src = src;
      video.addEventListener('error', onMediaError);
      video.play().catch(() => {
        // Autoplay rejection is not a stream failure — the user can hit play.
        setLoading(false);
      });
    }

    return () => {
      disposed = true;
      video.removeEventListener('playing', done);
      video.removeEventListener('canplay', done);
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('error', onMediaError);
      safeDestroy();
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (err) {
        console.warn('video teardown failed', err);
      }
    };
  }, [channel.id, channel.kind, channel.ext, nativeMode, attempt]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pickLevel = (index: number) => {
    setSelectedLevel(index);
    setQualityOpen(false);
    if (hlsRef.current) hlsRef.current.currentLevel = index;
  };

  const currentQualityLabel =
    selectedLevel === -1
      ? autoLabel
        ? `Auto · ${autoLabel}`
        : 'Auto'
      : levels.find((l) => l.index === selectedLevel)?.label ?? 'Auto';

  // Keep the custom overlay in sync with real playback state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => setPaused(v.paused);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };
    v.addEventListener('play', sync);
    v.addEventListener('pause', sync);
    v.addEventListener('volumechange', onVol);
    return () => {
      v.removeEventListener('play', sync);
      v.removeEventListener('pause', sync);
      v.removeEventListener('volumechange', onVol);
    };
  }, [channel.id]);

  useEffect(() => {
    const onFs = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setBarOpen(true);
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.6;
    setBarOpen(true);
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setBarOpen(true);
  };

  const toggleFullscreen = () => {
    const el = shellRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else video?.webkitEnterFullscreen?.();
  };

  // Auto-hide the controls layer after a few seconds on every device.
  useEffect(() => {
    if (!barOpen) return;
    if (paused) return;
    const t = setTimeout(() => setBarOpen(false), 3000);
    return () => clearTimeout(t);
  }, [barOpen, paused]);


  const revealBar = () => setBarOpen(true);


  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95 backdrop-blur-xl md:bg-[#07070b]/97 lg:flex-row lg:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">

      {barOpen && (
        <header className="flex shrink-0 animate-fade-in items-center gap-3 px-4 py-3 md:border-b md:border-white/10 md:bg-white/[0.03] md:px-6 md:py-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[11px] font-extrabold text-white"
            style={{ background: `linear-gradient(140deg, ${accent}, ${accent}55)` }}
          >
            {headerLogo.src ? (
              <img
                key={headerLogo.src}
                src={headerLogo.src}
                alt=""
                className="h-full w-full object-contain p-0.5"
                onError={headerLogo.onError}
              />
            ) : (
              initialsFor(channel.name)
            )}

          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{channel.name}</p>
            <p className="truncate text-[10px] uppercase tracking-wider text-white/40">{channel.group}</p>
          </div>
          {levels.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setQualityOpen((o) => !o)}
                aria-label="Quality"
                aria-expanded={qualityOpen}
                className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold text-white/70 transition hover:bg-white/10 hover:text-white active:scale-90"
              >
                <Settings2 className="h-4 w-4" />
                <span className="hidden sm:inline">{currentQualityLabel}</span>
              </button>
              {qualityOpen && (
                <div className="absolute right-0 top-full z-10 mt-2 min-w-[9rem] overflow-hidden rounded-xl border border-white/10 bg-black/90 py-1 backdrop-blur-xl">
                  <button
                    onClick={() => pickLevel(-1)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold transition hover:bg-white/10 ${
                      selectedLevel === -1 ? 'text-white' : 'text-white/60'
                    }`}
                  >
                    Auto
                    {autoLabel && <span className="text-[10px] text-white/40">{autoLabel}</span>}
                  </button>
                  {levels.map((l) => (
                    <button
                      key={l.index}
                      onClick={() => pickLevel(l.index)}
                      className={`block w-full px-3 py-2 text-left text-xs font-semibold transition hover:bg-white/10 ${
                        selectedLevel === l.index ? 'text-white' : 'text-white/60'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleFullscreen}
            aria-label="Fullscreen"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close player"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
      )}

      <div
        onPointerDown={revealBar}
        onMouseMove={revealBar}
        className="flex min-h-0 flex-1 items-stretch justify-center bg-black md:items-center md:bg-transparent md:p-5 lg:p-7"
      >
        <div
          ref={shellRef}
          className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden bg-black md:h-auto md:max-h-full md:flex-none md:aspect-video md:max-w-[1400px] md:rounded-2xl md:border md:border-white/10 md:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
        >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full bg-black object-contain"
          playsInline
          autoPlay
        />

        {/* Center play / pause — small circular control, fades with the bar */}
        {!loading && !error && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={paused ? 'Play' : 'Pause'}
            className={`absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/70 active:scale-90 sm:h-16 sm:w-16 ${
              barOpen || paused ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
            }`}
          >
            {paused ? (
              <Play className="h-6 w-6 translate-x-[1px] sm:h-7 sm:w-7" fill="currentColor" />
            ) : (
              <Pause className="h-6 w-6 sm:h-7 sm:w-7" fill="currentColor" />
            )}
          </button>
        )}

        {/* Bottom control bar */}
        {!error && (
          <div
            className={`absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)*0.5+0.6rem)] pt-8 transition-all duration-300 sm:px-5 ${
              barOpen || paused ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? 'Unmute' : 'Mute'}
              className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90"
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Volume"
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/25 accent-white sm:w-24"
            />
            {isLive && (
              <span className="ml-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/85 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#ff2d6f' }} />
                Live
              </span>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'}
              className={`rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90 ${isLive ? '' : 'ml-auto'}`}
            >
              {isFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          </div>
        )}

        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
            <p className="text-[11px] font-semibold tracking-wide text-white/55">Connecting to stream…</p>
          </div>
        )}


        {error && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-7 text-center shadow-2xl backdrop-blur-2xl">
              <span
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(255,45,111,0.14)' }}
              >
                <AlertTriangle className="h-6 w-6" style={{ color: '#ff2d6f' }} />
              </span>
              <p className="text-sm font-extrabold tracking-tight text-white">
                This channel is not responding
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                The source may be unavailable right now. Retry, or pick another channel.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => {
                    setNativeMode(false);
                    setAttempt((a) => a + 1);
                  }}
                  className="flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white transition hover:brightness-110 active:scale-95"
                  style={{ background: '#ff2d6f' }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </button>
                <button
                  onClick={onClose}
                  className="rounded-full border border-white/20 px-5 py-2 text-xs font-bold text-white/80 transition hover:border-white/40 hover:text-white active:scale-95"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      </div>


      {episodes && episodes.length > 0 && (
        <aside className="shrink-0 border-t border-white/10 bg-black/60 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] lg:w-72 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-4 lg:py-5">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Episodes</p>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible">
            {episodes.map((ep) => {
              const active = ep.id === currentEpisodeId;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => onSelectEpisode?.(ep)}
                  title={ep.title}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition active:scale-95 lg:w-full ${
                    active
                      ? 'border-[#ff2d6f] bg-[#ff2d6f]/15 text-white'
                      : 'border-white/10 bg-white/[0.05] text-white/70 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px] font-extrabold">E{ep.episode}</span>
                  <span className="block max-w-[8rem] truncate text-[10px] text-white/50 lg:max-w-full">{ep.title}</span>
                </button>
              );
            })}
          </div>
        </aside>
      )}
    </div>
  );

}
