import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Loader2, AlertTriangle, Maximize2, Settings2, RefreshCw } from 'lucide-react';
import { toPlayableUrl, type IptvChannel, type IptvEpisode } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import {
  probeStreamFailure,
  slotRetryDelay,
  SLOT_MAX_RETRIES,
  GEO_BLOCK_MESSAGE,
  AUTO_MAX_RETRIES,
  autoRetryDelay,
  STALL_TIMEOUT_MS,
} from '@/lib/iptvSlotRetry';

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
  /** Called when the provider slot limit persists after automatic refreshes. */
  onSlotLimit?: () => void;
}

export function LiveTVPlayer({
  channel,
  onClose,
  episodes,
  currentEpisodeId,
  onSelectEpisode,
  onSlotLimit,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsRef = useRef<{ destroy: () => void; unload?: () => void; detachMediaElement?: () => void } | null>(null);
  const [status, setStatusRaw] = useState<'loading' | 'playing' | 'error'>('loading');
  // Once the stream has produced frames for this channel, the loading overlay is
  // permanently locked out — no later buffering event may bring the spinner back.
  const playedOnceRef = useRef(false);
  const [playedOnce, setPlayedOnce] = useState(false);
  const setStatus = useCallback(
    (next: 'loading' | 'playing' | 'error' | ((s: 'loading' | 'playing' | 'error') => 'loading' | 'playing' | 'error')) => {
      setStatusRaw((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        if (value === 'playing' && !playedOnceRef.current) {
          playedOnceRef.current = true;
          setPlayedOnce(true);
        }
        // Locked: never fall back to the loading state during playback.
        if (value === 'loading' && playedOnceRef.current) return prev;
        return value;
      });
    },
    [],
  );

  const [errorKind, setErrorKind] = useState<'offline' | 'busy' | 'geo'>('offline');
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [autoLabel, setAutoLabel] = useState<string | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [slotLimited, setSlotLimited] = useState(false);
  const slotRetriesRef = useRef(0);
  const autoRetriesRef = useRef(0);
  const onSlotLimitRef = useRef(onSlotLimit);
  onSlotLimitRef.current = onSlotLimit;

  const accent = accentFor(channel.name);

  // A new channel starts with a clean retry budget and a fresh overlay lock.
  useEffect(() => {
    slotRetriesRef.current = 0;
    autoRetriesRef.current = 0;
    playedOnceRef.current = false;
    setPlayedOnce(false);
  }, [channel.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isVod = channel.kind === 'vod' || channel.kind === 'series';
    const src = `${toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext)}&_r=${attempt}`;
    // Safari / iOS decode HLS in the media element itself; every other browser
    // (Chrome, Edge, Firefox) needs hls.js + MSE for the same .m3u8.
    const nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
    const extLower = (channel.ext ?? '').toLowerCase();
    const isHlsUrl = extLower === 'm3u8' || extLower === 'm3u' || /\.m3u8?(\?|$)/i.test(src);

    setStatus('loading');
    setSlotLimited(false);
    setRetryIn(null);
    setLevels([]);
    setSelectedLevel(-1);
    setAutoLabel(null);
    setQualityOpen(false);

    let hls: Hls | null = null;
    let usedNative = false;
    let usedMpegts = false;
    // When MPEG-TS is tried first (raw .ts links), fall back to native playback
    // instead of surfacing an error straight away.
    let mpegtsFallback: (() => void) | null = null;
    let mediaRecoveries = 0;
    let networkRetries = 0;
    let cancelled = false;
    let retryTimer = 0;
    let countdownTimer = 0;

    // A failure may just be the provider's session limit: refresh a few times,
    // then let the parent move on to the first available episode.
    const handleFailure = async () => {
      if (cancelled) return;
      const failure = await probeStreamFailure(src);
      if (cancelled) return;
      // A geo restriction is provider-wide: retrying or switching channel cannot help.
      if (failure === 'geo') {
        setRetryIn(null);
        setErrorKind('geo');
        setStatus('error');
        return;
      }
      const limited = failure === 'slot';
      if (limited) {
        setSlotLimited(true);
        if (slotRetriesRef.current < SLOT_MAX_RETRIES) {
          const delay = slotRetryDelay(slotRetriesRef.current);
          slotRetriesRef.current += 1;
          setStatus('loading');
          // Visible countdown so a busy provider never looks like a frozen app.
          let left = Math.ceil(delay / 1000);
          setRetryIn(left);
          countdownTimer = window.setInterval(() => {
            left -= 1;
            setRetryIn(left > 0 ? left : null);
            if (left <= 0) window.clearInterval(countdownTimer);
          }, 1000);
          retryTimer = window.setTimeout(() => {
            if (!cancelled) setAttempt((a) => a + 1);
          }, delay);
          return;
        }
        if (onSlotLimitRef.current) {
          slotRetriesRef.current = 0;
          onSlotLimitRef.current();
          return;
        }
      }
      // Generic failures (dead engine, stalled segments) get silent timed
      // restarts before the user ever sees an error card.
      if (autoRetriesRef.current < AUTO_MAX_RETRIES) {
        const delay = autoRetryDelay(autoRetriesRef.current);
        autoRetriesRef.current += 1;
        setStatus('loading');
        let left = Math.ceil(delay / 1000);
        setRetryIn(left);
        window.clearInterval(countdownTimer);
        countdownTimer = window.setInterval(() => {
          left -= 1;
          setRetryIn(left > 0 ? left : null);
          if (left <= 0) window.clearInterval(countdownTimer);
        }, 1000);
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setAttempt((a) => a + 1);
        }, delay);
        return;
      }
      setRetryIn(null);
      setErrorKind(limited ? 'busy' : 'offline');
      setStatus('error');
    };


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
      else void playMpegts();
    };

    /**
     * Cheap first-line stall recovery (≤1.5s frozen): jump the tiny buffer hole,
     * or skip straight to the live edge when the stream fell behind. Only if
     * this keeps failing does the heavier engine escalation kick in.
     */
    let nudges = 0;
    const nudge = () => {
      nudges += 1;
      try {
        const buffered = video.buffered;
        const now = video.currentTime;
        // Live edge = end of the last buffered range (or seekable end).
        let target = now + 0.25;
        if (buffered.length) {
          const end = buffered.end(buffered.length - 1);
          if (end - now > 1) target = isVod ? now + 0.25 : Math.max(now + 0.25, end - 1);
          else {
            // Frozen at the head of the buffer: hop over the hole to the next range.
            for (let i = 0; i < buffered.length; i++) {
              if (buffered.start(i) > now) { target = buffered.start(i) + 0.05; break; }
            }
          }
        } else if (!isVod && video.seekable.length) {
          target = Math.max(now, video.seekable.end(video.seekable.length - 1) - 1.5);
        }
        if (target > now) video.currentTime = target;
        void video.play().catch(() => undefined);
        if (hls && nudges % 2 === 0) hls.startLoad();
      } catch { /* seeking not possible yet */ }
      // Repeated nudges mean the stream itself is dead — escalate.
      if (nudges >= 4) {
        nudges = 0;
        if (hls) recoverMedia();
        else if (!usedMpegts) void playMpegts();
      }
    };


    // Last engine in the chain: MPEG-TS / raw transport-stream demuxing in MSE.
    // Xtream VOD and live links are frequently .ts containers that <video> and
    // hls.js both refuse, but mpegts.js remuxes them to fMP4 on the fly.
    const playMpegts = async () => {
      if (usedMpegts) {
        const next = mpegtsFallback;
        mpegtsFallback = null;
        if (next) next();
        else void handleFailure();
        return;
      }
      usedMpegts = true;
      try {
        const mod: any = await import('mpegts.js');
        const mpegts: any = mod.default ?? mod;
        if (cancelled || !mpegts.isSupported()) {
          const next = mpegtsFallback;
          mpegtsFallback = null;
          if (next) next();
          else void handleFailure();
          return;
        }
        hls?.destroy();
        hls = null;
        hlsRef.current = null;
        setLevels([]);
        video.removeAttribute('src');
        video.load();
        const player = mpegts.createPlayer(
          { type: 'mse', isLive: !isVod, url: src, cors: true },
          { enableWorker: true, liveBufferLatencyChasing: !isVod, lazyLoad: false },
        );
        mpegtsRef.current = player;
        player.on(mpegts.Events.ERROR, () => {
          const next = mpegtsFallback;
          mpegtsFallback = null;
          if (next) next();
          else void handleFailure();
        });
        player.attachMediaElement(video);
        player.load();
        play();
      } catch {
        const next = mpegtsFallback;
        mpegtsFallback = null;
        if (next) next();
        else void handleFailure();
      }
    };

    // VOD items can be progressive MP4/MKV rather than HLS — fall back to native playback.
    const playNative = () => {
      if (usedNative) return;
      // Only Safari (and iOS WebViews) can decode an .m3u8 from a plain
      // <video src>. Everywhere else a native attempt would hang forever on
      // "Connecting to stream…", so hand HLS back to hls.js instead.
      if (isHlsUrl && !nativeHls) {
        if (Hls.isSupported() && !hls) {
          console.info('[LiveTVPlayer] native HLS unsupported → using hls.js');
          startHls();
          return;
        }
        if (!usedMpegts) {
          void playMpegts();
          return;
        }
      }
      usedNative = true;
      hls?.destroy();
      hls = null;
      hlsRef.current = null;
      setLevels([]);
      video.src = src;
      video.load();

      play();
    };

    const startHls = () => {
      hls = new Hls({
        lowLatencyMode: !isVod,
        enableWorker: true,
        backBufferLength: isVod ? 120 : 30,
        // Live: a tight, steadily-refilled buffer recovers from IPTV hiccups
        // faster than a huge one that takes ages to rebuild after a drop.
        maxBufferLength: isVod ? 90 : 30,
        maxMaxBufferLength: isVod ? 600 : 120,
        maxBufferSize: 120 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 1,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 15,
        // Stay ~3 segments behind the edge, but never drift more than 10;
        // slight speed-up catches up instead of seeking (no visible jump).
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        maxLiveSyncPlaybackRate: 1.5,
        liveDurationInfinity: !isVod,
        // Bounded so a dead origin surfaces as a retryable error instead of an
        // endless "Connecting to stream…" spinner.
        manifestLoadingTimeOut: 18000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 700,
        levelLoadingTimeOut: 18000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 800,

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
            // Nudge/seek first; recoverMediaError only if nudging keeps failing.
            nudge();

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
          // Live channels have no progressive fallback, so a failed manifest is
          // reported straight away instead of stalling on a dead <video> src.
          if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
            if (isVod && !usedNative) playNative();
            else void playMpegts();
          } else if (networkRetries < 5) {
            networkRetries += 1;
            window.setTimeout(() => hls?.startLoad(), 1000 * networkRetries);
          } else if (isVod && !usedNative) playNative();
          else void playMpegts();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {

          recoverMedia();
        } else if (!usedNative) playNative();
        else void playMpegts();
      });
    };

    // Engine selection up front: HTTP IPTV links are always fetched through the
    // HTTPS edge proxy (no mixed-content block), but the container decides which
    // engine can actually decode them. Guessing wrong is what left the player
    // stuck on "Connecting to stream…".
    const extHint = (channel.ext ?? '').toLowerCase();
    const tsFirst = extHint === 'ts' || extHint === 'mpegts' || extHint === 'mpg';
    // Xtream live channels are served by the proxy as raw MPEG-TS first on
    // desktop/Android to avoid one-slot HLS segment storms. If no explicit HLS
    // extension is known, start with mpegts.js and only fall back to HLS/native.
    const rawLiveFirst = !isVod && extHint !== 'm3u8' && extHint !== 'm3u';
    const progressive = ['mp4', 'm4v', 'mov', 'webm'].includes(extHint);

    if (tsFirst || rawLiveFirst) {
      // Raw transport streams: mpegts.js first, native as the safety net.
      mpegtsFallback = () => {
        if (Hls.isSupported() && !tsFirst) startHls();
        else playNative();
      };
      void playMpegts();
    } else if (progressive) {
      playNative();
    } else if (Hls.isSupported()) {
      startHls();
    } else {
      playNative();
    }


    // Hard connect watchdog: give the HTTPS proxy enough time to negotiate with
    // IPTV panels that require mobile-app headers, then move to the next
    // engine instead of spinning on "Connecting to stream…" forever.
    const connectWatchdog = window.setTimeout(() => {
      if (cancelled || video.readyState >= 3) return;
      if (!usedMpegts && (tsFirst || usedNative)) void playMpegts();
      else if (!usedNative) playNative();
      else void handleFailure();
    }, 18000);

    // Stall watchdog: playback that freezes mid-stream (frozen currentTime)
    // escalates through the engine chain instead of buffering forever.
    let lastTime = 0;
    let stalledFor = 0;
    const stallWatchdog = window.setInterval(() => {
      if (cancelled || video.paused || video.readyState < 2) return;
      if (video.currentTime > lastTime + 0.05) {
        lastTime = video.currentTime;
        stalledFor = 0;
        return;
      }
      stalledFor += 2000;
      if (stalledFor < STALL_TIMEOUT_MS) return;
      stalledFor = 0;
      setStatus((s) => (s === 'error' ? s : 'loading'));
      if (hls) recoverMedia();
      else if (!usedMpegts) void playMpegts();
      else if (!usedNative) playNative();
      else void handleFailure();
    }, 2000);

    /**
     * Fast micro-stall watchdog: sampled every 500ms, so a freeze longer than
     * 1.5s is nudged / skipped to the live edge immediately instead of sitting
     * in a buffering spinner until the 15s escalation runs.
     */
    let microTime = 0;
    let microFrozen = 0;
    const microWatchdog = window.setInterval(() => {
      if (cancelled || video.paused || video.readyState < 2) return;
      if (video.currentTime > microTime + 0.01) {
        microTime = video.currentTime;
        microFrozen = 0;
        nudges = 0;
        return;
      }
      microFrozen += 500;
      if (microFrozen < 1500) return;
      microFrozen = 0;
      nudge();
    }, 500);


    const onPlaying = () => {
      window.clearTimeout(connectWatchdog);
      window.clearInterval(countdownTimer);
      slotRetriesRef.current = 0;
      autoRetriesRef.current = 0;
      stalledFor = 0;
      setSlotLimited(false);
      setRetryIn(null);
      setStatus('playing');
    };
    // Some engines never fire `playing` (or fire it before React attaches the
    // listener) even though frames are already rendering — treat any sign of
    // decoded video as "playing" so the overlay can never stick.
    const onProgressSignal = () => {
      if (video.readyState >= 2 && !video.paused) onPlaying();
    };
    const onWaiting = () => {
      // Ignore spurious `waiting` while the clock is still advancing.
      if (video.readyState >= 3) return;
      setStatus((s) => (s === 'error' ? s : 'loading'));
    };
    const onError = () => {
      if (!usedNative) playNative();
      else void playMpegts();
    };
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onProgressSignal);
    video.addEventListener('loadeddata', onProgressSignal);
    video.addEventListener('timeupdate', onProgressSignal);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    // Final safety net: if frames are decoding but no event surfaced, clear it.
    const overlayGuard = window.setInterval(() => {
      if (cancelled) return;
      if (video.readyState >= 2 && video.currentTime > 0 && !video.paused) onPlaying();
    }, 500);



    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(connectWatchdog);
      window.clearInterval(countdownTimer);
      window.clearInterval(stallWatchdog);
      window.clearInterval(microWatchdog);
      window.clearInterval(overlayGuard);

      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onProgressSignal);
      video.removeEventListener('loadeddata', onProgressSignal);
      video.removeEventListener('timeupdate', onProgressSignal);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      hls?.destroy();
      hlsRef.current = null;
      try {
        mpegtsRef.current?.unload?.();
        mpegtsRef.current?.detachMediaElement?.();
        mpegtsRef.current?.destroy();
      } catch { /* engine already torn down */ }
      mpegtsRef.current = null;
      // Releasing the element's source tears the proxied request down, which
      // frees the provider's viewing slot immediately.
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

        {status === 'loading' && !playedOnce && (
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

        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-7 text-center shadow-2xl backdrop-blur-2xl">
              <span
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{
                  background: 'rgba(255,45,111,0.14)',
                }}
              >
                <AlertTriangle className="h-6 w-6" style={{ color: '#ff2d6f' }} />
              </span>
              <p className="text-sm font-extrabold tracking-tight text-white">
                {errorKind === 'geo'
                  ? 'Streaming blocked by the provider'
                  : 'This channel is not responding'}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                {errorKind === 'geo'
                  ? GEO_BLOCK_MESSAGE
                  : 'The source may be unavailable right now. Retry, or pick another channel.'}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => {
                    slotRetriesRef.current = 0;
                    autoRetriesRef.current = 0;
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
