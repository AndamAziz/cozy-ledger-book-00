import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X, Loader2, AlertTriangle, Maximize2, Minimize2, Settings2, RefreshCw,
  Play, Pause, Volume2, VolumeX, RotateCcw, Rewind, FastForward,
} from 'lucide-react';

import { toPlayableUrl, type IptvChannel, type IptvEpisode } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { useLogoFallback } from '@/lib/logoFallback';
import {
  nativeHlsSupported, playWithAutoplayFallback, toggleFullscreen,
  onFullscreenChange, fullscreenElement,
} from '@/lib/playback';
import {
  resumeKey, getResume, saveResume, clearResume, RESUME_END_MARGIN,
} from '@/lib/resumePlayback';
import { containerFromExt, engineChain, type Engine } from '@/lib/containerSniff';






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

/** mm:ss (or h:mm:ss for long movies) — used by the VOD progress bar. */
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
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
  /** mpegts.js player instance (raw MPEG-TS live feeds). */
  const tsRef = useRef<{ destroy: () => void } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** Index into the engine chain: each failure advances to the next engine. */
  const [stage, setStage] = useState(0);
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
  // VOD (movies / episodes) playback position — drives the seek bar.
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const isLive = (channel.kind ?? 'live') === 'live';
  /** Seek controls only make sense once the container reports a real length. */
  const seekable = !isLive && duration > 0;



  const accent = accentFor(channel.name);
  const headerLogo = useLogoFallback(channel.logo);


  // New channel / episode → back to the preferred engine and show the top bar.
  useEffect(() => {
    setStage(0);
    setAttempt(0);
    setLevels([]);
    setSelectedLevel(-1);
    setAutoLabel(null);
    setBarOpen(true);
    setQualityOpen(false);
  }, [channel.id]);

  /**
   * Engine ladder for this channel — identical in spirit to the IPTV M3U module
   * that plays flawlessly: HLS manifests go to hls.js (or native HLS on
   * Safari/iOS/Smart TVs), raw MPEG-TS live feeds go to mpegts.js (Chrome,
   * Edge, Firefox and Android WebView cannot play .ts natively), and
   * progressive movie files go straight to the media element.
   */
  const engines = useMemo<Engine[]>(() => {
    const kind = channel.kind ?? 'live';
    const nativeHls = nativeHlsSupported();
    if (kind !== 'live') {
      const container = containerFromExt(channel.ext);
      const chain = engineChain(container, { nativeHls });
      return chain.length ? chain : ['native'];
    }
    // Live: the stream proxy serves an HLS manifest when the provider has one
    // and falls back to a raw transport stream, so both must be covered.
    const chain: Engine[] = nativeHls ? ['native', 'hls', 'mpegts'] : ['hls', 'mpegts', 'native'];
    return chain.filter((e) => (e === 'hls' ? Hls.isSupported() : true));
  }, [channel.kind, channel.ext]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Destroying an engine is guarded: a throw here used to bubble up, hit the
    // error boundary and tear the whole player down mid-playback.
    const safeDestroy = () => {
      const inst = hlsRef.current;
      hlsRef.current = null;
      if (inst) {
        try {
          inst.destroy();
        } catch (err) {
          console.warn('hls destroy failed', err);
        }
      }
      const ts = tsRef.current;
      tsRef.current = null;
      if (ts) {
        try {
          ts.destroy();
        } catch (err) {
          console.warn('mpegts destroy failed', err);
        }
      }
    };

    safeDestroy();

    setLoading(true);
    setError(false);

    const engine = engines[Math.min(stage, engines.length - 1)] ?? 'native';
    // mpegts.js needs the transport-stream variant, not an HLS manifest.
    const src = toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext, {
      raw: engine === 'mpegts',
    });
    const done = () => setLoading(false);
    let disposed = false;

    /** Move to the next engine, or surface the error once the ladder is spent. */
    const nextEngine = () => {
      if (disposed) return;
      if (stage + 1 < engines.length) {
        setStage((s) => s + 1);
        return;
      }
      setLoading(false);
      setError(true);
    };
    const onMediaError = () => nextEngine();

    video.addEventListener('playing', done);
    video.addEventListener('canplay', done);
    video.addEventListener('loadeddata', done);

    if (engine === 'hls') {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20 });
      hlsRef.current = hls;
      let recovered = 0;
      try {
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch (err) {
        console.warn('hls init failed', err);
        safeDestroy();
        nextEngine();
        return;
      }
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLoading(false);
        setLevels(
          (data.levels ?? []).map((l, i) => ({ index: i, label: labelForLevel(l.height, l.bitrate) })),
        );
        playWithAutoplayFallback(video, () => setMuted(true)).catch(() => undefined);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const lvl = hls.levels?.[data.level];
        if (lvl) setAutoLabel(labelForLevel(lvl.height, lvl.bitrate));
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        // Same 3-stage in-place recovery ladder the IPTV M3U engine uses:
        // decoder glitches are recovered (then audio codec swapped), network
        // faults reload the manifest — only then do we fall to the next engine.
        if (recovered < 3) {
          recovered += 1;
          try {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              if (recovered <= 2) hls.recoverMediaError();
              else hls.swapAudioCodec();
              return;
            }
            hls.stopLoad();
            hls.loadSource(src);
            hls.startLoad();
            return;
          } catch (err) {
            console.warn('hls recovery failed', err);
          }
        }

        // Never destroy synchronously inside the handler — hls.js is still on
        // the stack and throwing there crashed the player.
        setTimeout(() => {
          if (disposed) return;
          safeDestroy();
          nextEngine();
        }, 0);
      });
    } else if (engine === 'mpegts') {
      // mpegts.js is loaded on demand so it never weighs on the initial bundle.
      import('mpegts.js')
        .then(({ default: mpegts }) => {
          if (disposed) return;
          if (!mpegts.isSupported() || !mpegts.getFeatureList().mseLivePlayback) {
            nextEngine();
            return;
          }
          const player = mpegts.createPlayer(
            { type: 'mpegts', isLive: (channel.kind ?? 'live') === 'live', url: src },
            { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false },
          );
          tsRef.current = player;
          player.on(mpegts.Events.ERROR, () => {
            setTimeout(() => {
              if (disposed) return;
              safeDestroy();
              nextEngine();
            }, 0);
          });
          try {
            player.attachMediaElement(video);
            player.load();
            playWithAutoplayFallback(video, () => setMuted(true)).catch(() => undefined);
          } catch (err) {
            console.warn('mpegts init failed', err);
            safeDestroy();
            nextEngine();
          }
        })
        .catch(() => nextEngine());
    } else {
      video.src = src;
      video.addEventListener('error', onMediaError);
      playWithAutoplayFallback(video, () => setMuted(true)).catch(() => {
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
  }, [channel.id, channel.kind, channel.ext, engines, stage, attempt]);



  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Arrow-key scrubbing for desktop and Smart TV remotes (VOD only).
      const v = videoRef.current;
      if (!v || isLive || !Number.isFinite(v.duration) || v.duration <= 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 30 : -10;
        v.currentTime = Math.min(Math.max(v.currentTime + delta, 0), v.duration);
        setCurrentTime(v.currentTime);
        setBarOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isLive]);


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

  // Track position / length for movies and episodes so they can be scrubbed,
  // and remember where the user stopped so playback resumes next time.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(0);
    setDuration(0);
    if (isLive) return;

    const key = resumeKey(channel.id, currentEpisodeId);
    let restored = false;
    let lastSaved = 0;

    const restore = () => {
      if (restored) return;
      const saved = getResume(key);
      if (!saved) {
        restored = true;
        return;
      }
      const len = Number.isFinite(v.duration) ? v.duration : 0;
      if (len > 0 && saved.time >= len - RESUME_END_MARGIN) {
        restored = true;
        return;
      }
      try {
        v.currentTime = saved.time;
        restored = true;
        setCurrentTime(saved.time);
      } catch {
        /* metadata not ready yet — retry on the next event */
      }
    };

    const onTime = () => {
      setCurrentTime(v.currentTime);
      const now = Date.now();
      if (now - lastSaved < 5000) return;
      lastSaved = now;
      saveResume(key, v.currentTime, Number.isFinite(v.duration) ? v.duration : 0);
    };
    const onMeta = () => {
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      restore();
    };
    const flush = () => saveResume(key, v.currentTime, Number.isFinite(v.duration) ? v.duration : 0);
    const onEnded = () => clearResume(key);

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('loadeddata', restore);
    v.addEventListener('pause', flush);
    v.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('loadeddata', restore);
      v.removeEventListener('pause', flush);
      v.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', flush);
    };
  }, [channel.id, currentEpisodeId, isLive]);


  useEffect(() => {
    const onFs = () => setIsFull(Boolean(fullscreenElement()));
    return onFullscreenChange(onFs);
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setBarOpen(true);
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  };

  /** Absolute seek, clamped to the media length. */
  const seekTo = (sec: number) => {
    const v = videoRef.current;
    if (!v || !seekable) return;
    const next = Math.min(Math.max(sec, 0), duration);
    try {
      v.currentTime = next;
    } catch {
      /* seek before metadata — ignored */
    }
    setCurrentTime(next);
    setBarOpen(true);
  };

  /** Relative skip: negative rewinds, positive fast-forwards. */
  const skip = (delta: number) => seekTo((videoRef.current?.currentTime ?? 0) + delta);

  /** Back to the very beginning of the movie / episode. */
  const restart = () => {
    seekTo(0);
    videoRef.current?.play().catch(() => undefined);
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

  const handleFullscreen = () => {
    // Handles iPhone (video-only fullscreen) plus prefixed WebKit/Edge APIs
    // used by Smart TV browsers.
    toggleFullscreen(shellRef.current, videoRef.current);
  };

  /* Smart TV remote: transport keys, channel/episode zapping and Back. */
  useEffect(() => {
    const stepEpisode = (delta: number) => {
      if (!episodes?.length || !onSelectEpisode) return false;
      const i = episodes.findIndex((ep) => ep.id === currentEpisodeId);
      const next = episodes[(Math.max(i, 0) + delta + episodes.length) % episodes.length];
      if (next) onSelectEpisode(next);
      return true;
    };

    const handlers: Record<string, (e: Event) => void> = {
      [TV_EVENT.playPause]: (e) => {
        e.preventDefault();
        togglePlay();
      },
      [TV_EVENT.mute]: (e) => {
        e.preventDefault();
        toggleMute();
      },
      [TV_EVENT.rewind]: (e) => {
        e.preventDefault();
        skip(-10);
      },
      [TV_EVENT.forward]: (e) => {
        e.preventDefault();
        skip(30);
      },
      [TV_EVENT.stop]: (e) => {
        e.preventDefault();
        onClose();
      },
      [TV_EVENT.back]: (e) => {
        e.preventDefault();
        onClose();
      },
      [TV_EVENT.channelUp]: (e) => {
        if (stepEpisode(1)) e.preventDefault();
      },
      [TV_EVENT.channelDown]: (e) => {
        if (stepEpisode(-1)) e.preventDefault();
      },
    };

    for (const [name, fn] of Object.entries(handlers)) window.addEventListener(name, fn);
    return () => {
      for (const [name, fn] of Object.entries(handlers)) window.removeEventListener(name, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, currentEpisodeId, onSelectEpisode, onClose, seekable, duration]);





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

      {/* Slim permanent header — never auto-hides */}
        <header className="flex shrink-0 items-center gap-2 px-3 py-1.5 md:border-b md:border-white/10 md:bg-white/[0.03] md:px-5 md:py-2">

          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-extrabold text-white"
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
            <p className="truncate text-[13px] font-bold leading-none text-white">
              {channel.name}
              <span className="ms-2 text-[10px] font-medium uppercase tracking-wider text-white/40">{channel.group}</span>
            </p>
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
            onClick={handleFullscreen}
            aria-label="Fullscreen"
            className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close player"
            className="rounded-lg p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

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
            className={`absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)*0.5+0.6rem)] pt-8 transition-all duration-300 sm:px-5 ${
              barOpen || paused ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
            }`}
          >
            {/* Seek bar — movies and episodes only (live streams have no length) */}
            {seekable && (
              <div className="flex items-center gap-2.5">
                <span className="w-10 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/70 sm:text-[11px]">
                  {formatTime(scrubbing ? scrubValue : currentTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1}
                  value={scrubbing ? scrubValue : Math.min(currentTime, duration)}
                  onChange={(e) => {
                    setScrubbing(true);
                    setScrubValue(Number(e.target.value));
                    setBarOpen(true);
                  }}
                  onPointerUp={() => {
                    setScrubbing(false);
                    seekTo(scrubValue);
                  }}
                  onKeyUp={() => {
                    setScrubbing(false);
                    seekTo(scrubValue);
                  }}
                  aria-label="Seek"
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
                />
                <span className="w-10 shrink-0 text-[10px] font-bold tabular-nums text-white/50 sm:text-[11px]">
                  {formatTime(duration)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
            {seekable && (
              <>
                <button
                  type="button"
                  onClick={restart}
                  aria-label="Restart from beginning"
                  title="Restart"
                  className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => skip(-10)}
                  aria-label="Rewind 10 seconds"
                  title="-10s"
                  className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <Rewind className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => skip(30)}
                  aria-label="Forward 30 seconds"
                  title="+30s"
                  className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90"
                >
                  <FastForward className="h-5 w-5" />
                </button>
              </>
            )}
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
              onClick={handleFullscreen}
              aria-label={isFull ? 'Exit fullscreen' : 'Fullscreen'}
              className={`rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white active:scale-90 ${isLive ? '' : 'ml-auto'}`}
            >
              {isFull ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            </div>
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
                    setStage(0);
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
