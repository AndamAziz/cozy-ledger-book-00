import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Loader2, AlertTriangle, Maximize2, Settings2 } from 'lucide-react';
import { toPlayableUrl, type IptvChannel, type IptvEpisode } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';

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
}

export function LiveTVPlayer({ channel, onClose, episodes, currentEpisodeId, onSelectEpisode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [autoLabel, setAutoLabel] = useState<string | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const accent = accentFor(channel.name);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isVod = channel.kind === 'vod' || channel.kind === 'series';
    const src = `${toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext)}&_r=${attempt}`;

    setStatus('loading');
    setLevels([]);
    setSelectedLevel(-1);
    setAutoLabel(null);
    setQualityOpen(false);

    let hls: Hls | null = null;
    let usedNative = false;
    let mediaRecoveries = 0;
    let networkRetries = 0;

    const play = () => video.play().catch(() => undefined);

    // Escalating media recovery: recoverMediaError → swapAudioCodec → native.
    const recoverMedia = () => {
      if (!hls) return;
      mediaRecoveries += 1;
      if (mediaRecoveries === 1) hls.recoverMediaError();
      else if (mediaRecoveries <= 3) {
        hls.swapAudioCodec();
        hls.recoverMediaError();
      } else if (!usedNative) playNative();
      else setStatus('error');
    };

    // VOD items can be progressive MP4/MKV rather than HLS — fall back to native playback.
    const playNative = () => {
      if (usedNative) return;
      usedNative = true;
      hls?.destroy();
      hls = null;
      hlsRef.current = null;
      setLevels([]);
      video.src = src;
      video.load();
      play();
    };

    if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: !isVod,
        enableWorker: true,
        backBufferLength: isVod ? 120 : 60,
        // Pre-load far more ahead so IPTV hiccups don't surface as freezes.
        maxBufferLength: isVod ? 90 : 45,
        maxMaxBufferLength: isVod ? 600 : 240,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeMaxRetry: 10,
        liveSyncDurationCount: 3,
        // Slow IPTV origins need generous timeouts before we call it an error.
        manifestLoadingTimeOut: 30000,
        manifestLoadingMaxRetry: 6,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 30000,
        levelLoadingMaxRetry: 6,
        fragLoadingTimeOut: 60000,
        fragLoadingMaxRetry: 8,
        fragLoadingRetryDelay: 1000,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const parsed = (hls?.levels ?? []).map((l, i) => ({
          index: i,
          label: labelForLevel(l.height, l.bitrate),
          height: l.height ?? 0,
        }));
        // Sort high → low and drop duplicate labels.
        const seen = new Set<string>();
        const unique = parsed
          .sort((a, b) => b.height - a.height)
          .filter((l) => (seen.has(l.label) ? false : (seen.add(l.label), true)))
          .map(({ index, label }) => ({ index, label }));
        setLevels(unique.length > 1 ? unique : []);
        play();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        const lvl = hls?.levels?.[data.level];
        setAutoLabel(lvl ? labelForLevel(lvl.height, lvl.bitrate) : null);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        // Non-fatal: self-heal stalls/gaps instead of surfacing an error.
        if (!data.fatal) {
          const d = data.details;
          if (
            d === Hls.ErrorDetails.BUFFER_STALLED_ERROR ||
            d === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL ||
            d === Hls.ErrorDetails.BUFFER_SEEK_OVER_HOLE
          ) {
            recoverMedia();
          } else if (
            d === Hls.ErrorDetails.FRAG_LOAD_ERROR ||
            d === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT ||
            d === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
            d === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT
          ) {
            // Nudge the loader back to life on flaky segment delivery.
            window.setTimeout(() => hls?.startLoad(), 500);
          }
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // A non-HLS payload (VOD) surfaces as a manifest parsing/network failure.
          if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR && !usedNative) playNative();
          else if (networkRetries < 5) {
            networkRetries += 1;
            window.setTimeout(() => hls?.startLoad(), 1000 * networkRetries);
          } else if (!usedNative) playNative();
          else setStatus('error');
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          recoverMedia();
        } else if (!usedNative) playNative();
        else setStatus('error');
      });
    } else {
      playNative();
    }


    const onPlaying = () => setStatus('playing');
    const onWaiting = () => setStatus((s) => (s === 'error' ? s : 'loading'));
    const onError = () => {
      if (!usedNative) playNative();
      else setStatus('error');
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [channel, attempt]);

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

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black/95 backdrop-blur-xl">
      <header className="flex items-center gap-3 px-4 py-3">
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

      <div ref={shellRef} className="relative flex flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          className="h-full max-h-full w-full object-contain"
          playsInline
          autoPlay
          controls
          muted={false}
        />

        {status === 'loading' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
            <p className="text-xs font-semibold text-white/60">Connecting to stream…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <AlertTriangle className="h-8 w-8 text-[#ff2d6f]" />
            <p className="text-sm font-bold text-white">This channel is not responding</p>
            <p className="text-xs text-white/50">
              It may be offline or all viewing slots are in use. Retry, or pick another channel.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="rounded-full bg-[#ff2d6f] px-5 py-2 text-xs font-bold text-white active:scale-95"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="rounded-full border border-white/20 px-5 py-2 text-xs font-bold text-white/80 active:scale-95"
              >
                Back to channels
              </button>
            </div>
          </div>
        )}
      </div>

      {episodes && episodes.length > 0 && (
        <div className="shrink-0 border-t border-white/10 bg-black/60 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)]">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Episodes</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {episodes.map((ep) => {
              const active = ep.id === currentEpisodeId;
              return (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => onSelectEpisode?.(ep)}
                  title={ep.title}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-left transition active:scale-95 ${
                    active
                      ? 'border-[#ff2d6f] bg-[#ff2d6f]/15 text-white'
                      : 'border-white/10 bg-white/[0.05] text-white/70 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <span className="block text-[11px] font-extrabold">E{ep.episode}</span>
                  <span className="block max-w-[8rem] truncate text-[10px] text-white/50">{ep.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>

  );
}
