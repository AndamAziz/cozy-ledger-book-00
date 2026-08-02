import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Loader2, AlertTriangle, Maximize2, Settings2, RefreshCw } from 'lucide-react';
import { toPlayableUrl, type IptvChannel, type IptvEpisode } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { useIsMobile } from '@/hooks/use-mobile';


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

  const accent = accentFor(channel.name);

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

    hlsRef.current?.destroy();
    hlsRef.current = null;

    setLoading(true);
    setError(false);

    const src = toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext);
    const done = () => setLoading(false);

    video.addEventListener('playing', done);
    video.addEventListener('canplay', done);
    video.addEventListener('loadeddata', done);

    // Movies / episodes are progressive containers (mp4, mkv…): hls.js cannot
    // parse them, so they play natively — exactly like the IPTV M3U module,
    // which only engages hls.js for HLS manifests.
    const isHls = (channel.kind ?? 'live') === 'live';

    if (!nativeMode && isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
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
        if (!data.fatal) return;
        hls.destroy();
        hlsRef.current = null;
        setNativeMode(true);
      });
    } else {
      video.src = src;
      video
        .play()
        .then(() => setLoading(false))
        .catch(() => {
          setLoading(false);
          setError(true);
        });
      video.addEventListener('error', () => {
        setLoading(false);
        setError(true);
      });
    }

    return () => {
      video.removeEventListener('playing', done);
      video.removeEventListener('canplay', done);
      video.removeEventListener('loadeddata', done);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
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

  const goFullscreen = () => {
    const el = shellRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else video?.webkitEnterFullscreen?.();
  };

  // Auto-hide the top banner after a few seconds on touch/handheld layouts only.
  // On desktop the chrome stays put — that is the standard player behaviour.
  const isDesktop = useIsMobile() === false;
  useEffect(() => {
    if (isDesktop) {
      setBarOpen(true);
      return;
    }
    if (!barOpen) return;
    const t = setTimeout(() => setBarOpen(false), 4000);
    return () => clearTimeout(t);
  }, [barOpen, isDesktop]);

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
            {channel.logo ? (
              <img src={channel.logo} alt="" className="h-full w-full object-contain p-0.5" />
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
            onClick={goFullscreen}
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
        className="flex min-h-0 flex-1 items-center justify-center bg-black md:bg-transparent md:p-5 lg:p-7"
      >
        <div
          ref={shellRef}
          className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black md:h-auto md:max-h-full md:aspect-video md:max-w-[1400px] md:rounded-2xl md:border md:border-white/10 md:shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
        >
        <video
          ref={videoRef}
          className="h-full max-h-full w-full object-contain"
          playsInline
          autoPlay
          controls
        />


        {loading && !error && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[2px]">
            <span className="relative flex h-14 w-14 items-center justify-center">
              <span
                className="absolute inset-0 animate-ping rounded-full opacity-25"
                style={{ background: accent }}
              />
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
            </span>
            <p className="text-xs font-semibold text-white/70">Connecting to stream…</p>
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
