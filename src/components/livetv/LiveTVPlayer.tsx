import { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  X, Loader2, AlertTriangle, Maximize2, Minimize2, Settings2, RefreshCw,
  Play, Pause, Volume2, VolumeX, RotateCcw, Rewind, FastForward, SkipBack, SkipForward,
} from 'lucide-react';

import {
  toPlayableUrl, resolveDirectUrl, invalidateDirectUrl, fetchLiveFormats,
  type IptvChannel, type IptvEpisode,
} from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { useLogoFallback } from '@/lib/logoFallback';
import {
  nativeHlsSupported, playWithAutoplayFallback, toggleFullscreen,
  onFullscreenChange, fullscreenElement, onVideoFullscreenChange,
} from '@/lib/playback';
import {
  resumeKey, getResume, saveResume, clearResume, RESUME_END_MARGIN,
} from '@/lib/resumePlayback';
import { canSeekTo, isPrematureEnd } from '@/lib/vodSeek';
import { containerFromExt, engineChain, type Engine } from '@/lib/containerSniff';
import { liveEngineOrder, candidateFormatFor } from '@/lib/liveLadder';
import { clearLiveDiag, publishLiveDiag } from '@/lib/livePlaybackDiag';
import { isHevcCodec, isUnsupportedHevc } from '@/lib/codecSupport';

import { claimStreamSlot, releaseActiveStream, unregisterStream } from '@/lib/streamSlot';
import { acquirePlayerMount, releasePlayerMount } from '@/lib/playerMount';
import { diagnoseStream, type StreamDiagnosis } from '@/lib/streamDiagnose';
import { MAX_RETRIES as MAX_STREAM_RETRIES, RETRY_DELAY_MS as STREAM_RETRY_DELAY_MS } from '@/lib/iptvCatalog';

/**
 * Silent wait-out for the provider's single-slot / throttle refusals. The
 * viewer must never see a popup for those: they clear by themselves, so we keep
 * reconnecting behind the normal spinner for a generous number of rounds.
 */
const SLOT_WAIT_MS = 5_000;
const MAX_SLOT_WAITS = 8;


import { TV_EVENT, isTvDevice } from '@/lib/tvRemote';
import { hlsConfigFor, mpegtsConfigFor } from '@/lib/tvMode';






interface QualityLevel {
  /** hls.js level index, or -1 for auto */
  index: number;
  label: string;
}

/** Xtream panels can keep a closed live socket counted briefly while draining. */
const LIVE_RELEASE_GRACE_MS = 1_500;

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
  /** Zap to the next (+1) / previous (-1) channel of the list it was opened from. */
  onZapChannel?: (delta: number) => void;
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
  onZapChannel,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  /** mpegts.js player instance (raw MPEG-TS live feeds). */
  const tsRef = useRef<{
    pause?: () => void;
    unload?: () => void;
    detachMediaElement?: () => void;
    destroy: () => void;
  } | null>(null);

  /**
   * Single-instance guard: if another player overlay is still mounted (e.g. a
   * series episode player while a live channel is opened), it is closed here so
   * only one media element ever streams.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = acquirePlayerMount(() => closeRef.current());
    return () => {
      releasePlayerMount(token);
      clearLiveDiag();
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /**
   * Codec this browser cannot decode (HEVC/H.265 video, E-AC-3 style audio):
   * an honest message beats cycling engines and reporting "not responding".
   */
  const [codecIssue, setCodecIssue] = useState<string | null>(null);
  /** Provider-side refusal (slot limit, throttle, auth) reported by the proxy. */
  const [blocked, setBlocked] = useState<StreamDiagnosis | null>(null);
  /**
   * Seconds left before Retry is allowed again after a wait-only refusal
   * (single-slot / rate limit). Retrying instantly just re-triggers HTTP 458.
   */
  const [cooldown, setCooldown] = useState(0);
  /** Silent auto-recovery from wait-only provider refusals (slot limit/throttle). */
  const slotWaits = useRef(0);

  useEffect(() => {
    if (!blocked?.waitOnly) {
      setCooldown(0);
      return;
    }
    setCooldown(25);
    const t = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [blocked]);




  /** Index into the engine chain: each failure advances to the next engine. */
  const [stage, setStage] = useState(0);

  const [attempt, setAttempt] = useState(0);
  /** True while waiting out the backoff between whole-ladder retries. */
  const [retrying, setRetrying] = useState(false);
  /** Bumped by the manual Retry button to force a fresh ladder run. */
  const [reload, setReload] = useState(0);
  /**
   * Direct-play state: once a direct provider URL fails for this channel we stop
   * trying it and stream through the proxy for the rest of the session.
   */
  const directDead = useRef(false);
  /** True once real frames were shown — a stall after this is recoverable. */
  const startedRef = useRef(false);
  /** The viewer pressed pause themselves: never auto-resume in that case. */
  const userPausedRef = useRef(false);
  /** Position (seconds) a VOD reload must continue from. */
  const vodResume = useRef<number | null>(null);
  /** Always the latest seek handler — used by remote/keyboard scrubbing. */
  const seekRef = useRef<(sec: number) => void>(() => undefined);

  useEffect(() => {
    directDead.current = false;
    startedRef.current = false;
    userPausedRef.current = false;
    vodResume.current = null;
  }, [channel.id, currentEpisodeId]);




  const [levels, setLevels] = useState<QualityLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [autoLabel, setAutoLabel] = useState<string | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(true);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFull, setIsFull] = useState(() => Boolean(fullscreenElement()));
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
    setRetrying(false);
    setCodecIssue(null);
    setBlocked(null);


    setLevels([]);
    setSelectedLevel(-1);
    setAutoLabel(null);
    setBarOpen(true);
    setQualityOpen(false);
  }, [channel.id]);

  /**
   * Provider serves transport streams only (`allowed_output_formats` has no
   * m3u8). Those panels refuse a `.m3u8` request with a private status that
   * reads like "all slots in use", so leading with hls.js made the player loop
   * on a false error. Learned once per source and cached.
   */
  const [tsOnly, setTsOnly] = useState(false);
  /** `allowed_output_formats` as advertised by the panel — shown in diagnostics. */
  const [panelFormats, setPanelFormats] = useState<string[]>([]);
  useEffect(() => {
    if ((channel.kind ?? 'live') !== 'live') return;
    let alive = true;
    fetchLiveFormats().then((info) => {
      if (!alive) return;
      setTsOnly(info.tsOnly);
      setPanelFormats(info.formats);
    });
    return () => {
      alive = false;
    };
  }, [channel.kind]);

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
    // TS-only panel: mpegts.js first (it asks the proxy for `raw=1`, the .ts
    // variant). hls.js stays last as a courtesy for mislabelled feeds.
    return liveEngineOrder({
      tsOnly,
      nativeHls,
      hlsSupported: Hls.isSupported(),
    }) as Engine[];
  }, [channel.kind, channel.ext, tsOnly]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let retryTimer: number | undefined;
    const isLiveKind = (channel.kind ?? 'live') === 'live';



    // Destroying an engine is guarded: a throw here used to bubble up, hit the
    // error boundary and tear the whole player down mid-playback.
    const safeDestroy = () => {
      const inst = hlsRef.current;
      hlsRef.current = null;
      if (inst) {
        try {
          inst.stopLoad();
          inst.detachMedia();
          inst.destroy();
        } catch (err) {
          console.warn('hls destroy failed', err);
        }
      }
      const ts = tsRef.current;
      tsRef.current = null;
      if (ts) {
        try {
          ts.pause?.();
          ts.unload?.();
          ts.detachMediaElement?.();
          ts.destroy();
        } catch (err) {
          console.warn('mpegts destroy failed', err);
        }
      }
    };

    /**
     * Live-only hard stop. Destroying hls.js/mpegts.js is not sufficient on
     * every browser: the media element may keep its native fetch/socket alive
     * until its source is explicitly removed and load() resets the resource.
     * Register this complete teardown with the single-slot guard so channel
     * zapping closes the old Xtream viewer before the next one is requested.
     */
    const hardStopLive = () => {
      safeDestroy();
      if ((channel.kind ?? 'live') !== 'live') return;
      try {
        video.pause();
        video.removeAttribute('src');
        video.srcObject = null;
        video.load();
      } catch (err) {
        console.warn('live stream teardown failed', err);
      }
    };

    // Hard-close the previous session and wait out the provider's release grace
    // period: the account allows a single connection, so overlapping opens are
    // what produced "max connections" errors when zapping channels.
    const slotTeardown = (channel.kind ?? 'live') === 'live' ? hardStopLive : safeDestroy;
    const claimedWait = claimStreamSlot(slotTeardown);
    const slotWait = (channel.kind ?? 'live') === 'live'
      ? Math.max(claimedWait, LIVE_RELEASE_GRACE_MS)
      : claimedWait;

    setLoading(true);
    setError(false);

    const engine = engines[Math.min(stage, engines.length - 1)] ?? 'native';
    // mpegts.js needs the transport-stream variant, not an HLS manifest.
    const proxySrc = toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext, {
      raw: engine === 'mpegts',
    });
    // Preferred source: the provider's own (tokenized) URL, streamed straight to
    // the browser. `src` is reassigned once before any engine attaches, so every
    // closure below (recovery reloads included) sees the source actually in use.
    let src = proxySrc;
    let usingDirect = false;
    /** Publish what this attempt committed to, for the diagnostics panel. */
    const reportDiag = () =>
      publishLiveDiag({
        channelId: channel.id,
        channelName: channel.name,
        format: candidateFormatFor(engine, channel.kind ?? 'live'),
        engine,
        ladder: engines,
        route: usingDirect ? 'direct' : 'proxy',
        formats: panelFormats,
        tsOnly,
        stage,
        attempt,
        src,
      });
    reportDiag();
    let disposed = false;
    /** Stop everything and tell the viewer the codec — not the feed — is the problem. */
    const flagCodec = (label: string) => {
      if (disposed) return;
      setLoading(false);
      setCodecIssue(label);
      clearWatchdog();
      setTimeout(() => {
        if (!disposed) safeDestroy();
      }, 0);
    };

    /**
     * Load watchdog: if no frame arrives within 15s the stream is treated as a
     * failure so "Connecting to stream…" can never spin forever, even if the
     * backend hangs without returning an error.
     */
    let watchdog: number | undefined;
    const clearWatchdog = () => {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
        watchdog = undefined;
      }
    };
    const armWatchdog = () => {
      watchdog = window.setTimeout(() => {
        if (!disposed) nextEngine();
        // Direct playback either starts fast or is unreachable — fail over to the
        // proxy quickly instead of holding the viewer on a spinner for 15s.
      }, usingDirect ? 8_000 : 15_000);
    };
    const done = () => {
      clearWatchdog();
      setLoading(false);
    };

    /**
     * Move to the next engine; once the ladder is spent, retry the whole ladder
     * up to MAX_STREAM_RETRIES times with a fixed backoff, then stop and ask the
     * user to try again rather than looping forever.
     */
    let diagnosing = false;
    /** In-place mid-playback recoveries used so far (VOD only). */
    let midRecover = 0;
    const nextEngine = () => {
      if (disposed || diagnosing) return;
      clearWatchdog();
      // Direct playback failed (CORS-less provider, expired token, blocked
      // segment): drop straight back to the proxy for the SAME engine instead of
      // burning a ladder step — no diagnosis needed, the proxy path is proven.
      if (usingDirect) {
        usingDirect = false;
        directDead.current = true;
        invalidateDirectUrl(channel.id);
        if (!isLiveKind) vodResume.current = video.currentTime;
        safeDestroy();
        setReload((r) => r + 1);
        return;
      }
      // A movie / episode that was already playing must never restart from zero
      // or be left frozen on a paused frame: reload the same source in place and
      // continue from the exact second the viewer was at.
      if (!isLiveKind && startedRef.current && midRecover < 3) {
        midRecover += 1;
        vodResume.current = video.currentTime;
        safeDestroy();
        setReload((r) => r + 1);
        return;
      }

      // Before burning more attempts, ask the proxy what actually went wrong.
      // A single-slot provider (HTTP 458/429 MAX_CONNECTIONS) must be reported
      // honestly, and the ladder MUST stay paused while we ask — otherwise the
      // probe plus the next engine fight over the one available slot.
      diagnosing = true;
      // Close the failed media socket before the diagnostic request. Xtream
      // accounts with max_connections=1 otherwise see the diagnostic itself as
      // a competing viewer and answer 458 even when no other device is active.
      safeDestroy();
      releaseActiveStream();
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* best-effort socket release */
      }
      window.setTimeout(() => void diagnoseStream(proxySrc).then((diag) => {
        diagnosing = false;
        if (disposed) return;
        if (diag) {
          // Slot / throttle refusals clear by themselves. Never interrupt the
          // viewer with a popup for those — silently wait out the provider and
          // reconnect behind the normal loading spinner.
          if (diag.waitOnly && slotWaits.current < MAX_SLOT_WAITS) {
            slotWaits.current += 1;
            safeDestroy();
            releaseActiveStream();
            setRetrying(true);
            retryTimer = window.setTimeout(() => {
              if (disposed) return;
              setRetrying(false);
              setStage(0);
              setReload((r) => r + 1);
            }, SLOT_WAIT_MS);
            return;
          }
          safeDestroy();
          clearWatchdog();
          if (retryTimer !== undefined) clearTimeout(retryTimer);
          setRetrying(false);
          setLoading(false);
          if (diag.waitOnly) setError(true);
          else setBlocked(diag);
          return;
        }
        advanceLadder();
      }), 900);
    };

    const advanceLadder = () => {
      if (disposed) return;
      if (stage + 1 < engines.length) {
        setStage((s) => s + 1);
        return;
      }
      if (attempt + 1 < MAX_STREAM_RETRIES) {
        setRetrying(true);
        safeDestroy();
        retryTimer = window.setTimeout(() => {
          if (disposed) return;
          setRetrying(false);
          setStage(0);
          setAttempt((a) => a + 1);
        }, STREAM_RETRY_DELAY_MS);
        return;
      }
      setRetrying(false);
      setLoading(false);
      setError(true);
    };

    const onMediaError = () => nextEngine();

    /** Frames are flowing — mid-playback faults may now recover in place. */
    const onPlaying = () => {
      startedRef.current = true;
      done();
    };
    /** After a reload, continue the movie / episode where it stopped. */
    const seekResume = () => {
      const at = vodResume.current;
      if (at == null || isLiveKind) return;
      vodResume.current = null;
      try {
        if (at > 0) video.currentTime = at;
      } catch {
        /* metadata not ready — the next event retries */
      }
      if (!userPausedRef.current) video.play().catch(() => undefined);
    };

    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', done);
    video.addEventListener('loadeddata', done);
    video.addEventListener('loadeddata', seekResume);
    video.addEventListener('canplay', seekResume);

    /**
     * VOD stall guard. Movies and episodes were "pausing for no reason": a
     * segment/range request that never completes leaves the media element
     * stalled with no error event, so nothing recovered it. Every 4s we check
     * that the clock is still moving; two gentle nudges first, then a silent
     * in-place reload from the same second.
     */
    let stallTicker: number | undefined;
    if (!isLiveKind) {
      let lastPos = -1;
      let stallHits = 0;
      stallTicker = window.setInterval(() => {
        if (disposed || retrying) return;
        if (video.paused || video.seeking || video.ended || userPausedRef.current || !startedRef.current) {
          lastPos = video.currentTime;
          stallHits = 0;
          return;
        }
        if (video.currentTime > lastPos + 0.2) {
          lastPos = video.currentTime;
          stallHits = 0;
          return;
        }
        stallHits += 1;
        if (stallHits <= 2) {
          try {
            hlsRef.current?.startLoad();
          } catch {
            /* engine already gone */
          }
          video.play().catch(() => undefined);
          return;
        }
        stallHits = 0;
        vodResume.current = video.currentTime;
        safeDestroy();
        setReload((r) => r + 1);
      }, 4_000);
    }


    const attach = () => {
    if (engine === 'hls') {

      const hls = new Hls(hlsConfigFor());
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
        // Codec-risk gate: an HEVC/H.265 feed (common on Kurdish channels such
        // as NRT FHD / Suroyo) cannot be decoded by Chrome/Edge/Firefox at all,
        // so every engine would fail identically. Say so instead.
        const codecs = (data.levels ?? [])
          .map((l) => l.videoCodec || (l as { codecSet?: string }).codecSet || '')
          .filter(Boolean);
        if (codecs.length && codecs.every((c) => isUnsupportedHevc(c))) {
          flagCodec('HEVC / H.265');
          return;
        }

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
      // Media playlists carry no CODECS attribute, so the real codec only shows
      // up once a fragment is parsed / a source buffer is created.
      hls.on(Hls.Events.BUFFER_CODECS, (_e, data) => {
        const codec = (data as { video?: { codec?: string } })?.video?.codec ?? '';
        if (!isUnsupportedHevc(codec)) return;
        flagCodec('HEVC / H.265');
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || disposed) return;
        // A codec the browser refuses (HEVC video, E-AC-3 audio) fails the same
        // way on every engine — flag it instead of cycling and blaming the feed.
        const d = data as unknown as { details?: string; mimeType?: string; reason?: string; error?: { message?: string } };
        const hint = [d.mimeType, d.reason, d.error?.message].filter(Boolean).join(' ');
        if (/CodecError|IncompatibleCodecs/i.test(String(d.details ?? ''))) {
          flagCodec(isHevcCodec(hint) ? 'HEVC / H.265' : 'an unsupported video/audio codec');
          return;
        }

        // Same 3-stage in-place recovery ladder the IPTV M3U engine uses:
        // decoder glitches are recovered (then audio codec swapped), network
        // faults reload the manifest — only then do we fall to the next engine.
        // Exception: a direct provider URL is either reachable or it is not
        // (CORS-less response, geo-block, expired token). Retrying it in place
        // only delays the proven proxy path, so we bail out on the first fault.
        if (recovered < 3 && !usingDirect) {
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
            mpegtsConfigFor(),
          );
          tsRef.current = player;
          let codecBlocked = false;
          // Raw MPEG-TS carrying HEVC video: report the codec, don't retry.
          player.on(mpegts.Events.MEDIA_INFO, (info: { videoCodec?: string; mimeType?: string }) => {
            const codec = info?.videoCodec || info?.mimeType || '';
            if (!isUnsupportedHevc(codec)) return;
            codecBlocked = true;
            flagCodec(isHevcCodec(codec) ? 'HEVC / H.265' : codec);
          });

          player.on(mpegts.Events.ERROR, () => {
            if (codecBlocked) return;


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
    };

    // Open the upstream connection only after the previous slot was released.
    const startTimer = window.setTimeout(() => {
      if (disposed) return;
      const begin = () => {
        if (disposed) return;
        armWatchdog();
        attach();
      };
      // LIVE (Direct tab): proxy-only. A direct provider URL opens a SECOND
      // Xtream viewer connection next to the one the proxy/handshake already
      // holds, and single-slot accounts answer 458 — which is exactly what made
      // Direct live channels loop through "Reconnecting…". The proxy path is
      // proven, so live never handshakes for a direct URL.
      if ((channel.kind ?? 'live') === 'live' || directDead.current) {
        begin();
        return;
      }
      // Movies / series keep the direct-first handshake (a tiny JSON call, not
      // the bytes) — that path is working and must not change.
      void resolveDirectUrl(channel.id, channel.kind ?? 'live', channel.ext, engine === 'mpegts')
        .then((direct) => {
          if (disposed) return;
          if (direct) {
            src = direct;
            usingDirect = true;
          }
          reportDiag();
          begin();
        })
        .catch(() => begin());
    }, slotWait);


    return () => {
      disposed = true;
      clearWatchdog();
      clearTimeout(startTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      if (stallTicker !== undefined) clearInterval(stallTicker);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', done);
      video.removeEventListener('loadeddata', done);
      video.removeEventListener('loadeddata', seekResume);
      video.removeEventListener('canplay', seekResume);
      video.removeEventListener('error', onMediaError);

      if ((channel.kind ?? 'live') === 'live') {
        // Count this as a real slot release. The next Live TV effect will wait
        // for the provider grace window before opening its upstream request.
        releaseActiveStream();
      } else {
        // Preserve the existing, working Movies/Series teardown path exactly.
        safeDestroy();
        unregisterStream(slotTeardown);
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (err) {
          console.warn('video teardown failed', err);
        }
      }
    };

  }, [channel.id, channel.kind, channel.ext, engines, stage, attempt, reload]);



  useEffect(() => {
    let escAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // On TV a single Back/Exit closes. Off TV, require a deliberate
        // double-press so a stray Escape never kills a running stream.
        const now = Date.now();
        if (isTvDevice() || now - escAt < 1500) {
          escAt = 0;
          onClose();
        } else {
          escAt = now;
        }
        return;
      }
      // Arrow-key scrubbing for desktop and Smart TV remotes (VOD only).
      const v = videoRef.current;
      if (!v || isLive || !Number.isFinite(v.duration) || v.duration <= 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const delta = e.key === 'ArrowRight' ? 30 : -10;
        seekRef.current(v.currentTime + delta);
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
    /** Furthest point playback actually reached (never a jump-to-end artefact). */
    let playedTo = 0;
    /** True once a resume seek was issued — a premature end then means "no Range". */
    let seekedForResume = false;

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
      // Only seek when the element really can: a Range-less progressive stream
      // reports a length it cannot seek inside, and forcing it there jumps the
      // movie/episode straight to its end.
      if (!canSeekTo(v.seekable, saved.time)) return;
      try {
        v.currentTime = saved.time;
        restored = true;
        seekedForResume = true;
        playedTo = saved.time;
        setCurrentTime(saved.time);
      } catch {
        /* metadata not ready yet — retry on the next event */
      }
    };

    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime > playedTo) playedTo = v.currentTime;
      const now = Date.now();
      if (now - lastSaved < 5000) return;
      lastSaved = now;
      saveResume(key, v.currentTime, Number.isFinite(v.duration) ? v.duration : 0);
    };
    const onMeta = () => {
      setDuration(Number.isFinite(v.duration) ? v.duration : 0);
      restore();
    };
    const flush = () => saveResume(key, playedTo, Number.isFinite(v.duration) ? v.duration : 0);
    /**
     * Real end → forget the position. A *premature* end (the timeline collapsed
     * after a failed Range seek, or the provider dropped the connection) must
     * never be shown as "finished": drop the stored position and reload in place
     * from the last point that actually played.
     */
    const onEnded = () => {
      const len = Number.isFinite(v.duration) ? v.duration : 0;
      if (isPrematureEnd(playedTo, len)) {
        clearResume(key);
        vodResume.current = seekedForResume ? null : playedTo;
        // The direct CDN URL cannot serve this file seekably — never use it again
        // for this title; the proxy path slices ranges correctly.
        if (!directDead.current) {
          directDead.current = true;
          invalidateDirectUrl(channel.id);
        }
        setReload((r) => r + 1);
        return;
      }
      clearResume(key);
    };


    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('loadeddata', restore);
    v.addEventListener('canplay', restore);
    v.addEventListener('pause', flush);
    v.addEventListener('ended', onEnded);
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('loadeddata', restore);
      v.removeEventListener('canplay', restore);
      v.removeEventListener('pause', flush);
      v.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', flush);
    };
  }, [channel.id, currentEpisodeId, isLive]);



  useEffect(() => {
    const onFs = () => setIsFull(Boolean(fullscreenElement()));
    const offDoc = onFullscreenChange(onFs);
    const offVideo = onVideoFullscreenChange(videoRef.current, onFs);
    return () => {
      offDoc();
      offVideo();
    };
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    setBarOpen(true);
    if (v.paused) {
      userPausedRef.current = false;
      v.play().catch(() => undefined);
    } else {
      userPausedRef.current = true;
      v.pause();
    }
  };


  /**
   * Re-open the movie / episode at `sec` through the proxy.
   *
   * Native IPTV players re-request the file at a byte offset when the provider
   * refuses HTTP Range on the direct CDN URL. Our proxy synthesizes proper 206
   * slices, so switching to it makes mid-file seeking work everywhere.
   */
  const reloadFrom = (sec: number) => {
    vodResume.current = Math.max(0, sec);
    if (!directDead.current) {
      directDead.current = true;
      invalidateDirectUrl(channel.id);
    }
    setLoading(true);
    setReload((r) => r + 1);
  };

  /** Absolute seek, clamped to the media length. */
  const seekTo = (sec: number) => {
    const v = videoRef.current;
    if (!v || !seekable) return;
    const next = Math.min(Math.max(sec, 0), duration);
    setCurrentTime(next);
    setBarOpen(true);
    // The element cannot seek there (Range-less progressive stream): reload in
    // place from that offset instead of letting the browser jump to the end.
    if (next > 1 && !canSeekTo(v.seekable, next)) {
      reloadFrom(next);
      return;
    }
    try {
      v.currentTime = next;
    } catch {
      /* seek before metadata — ignored */
    }
  };
  seekRef.current = seekTo;



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
      // Remote Stop/Back closes the player on TV only — off TV these come from
      // stray keys, mouse back buttons or a drifting gamepad.
      [TV_EVENT.stop]: (e) => {
        if (!isTvDevice()) return;
        e.preventDefault();
        onClose();
      },
      [TV_EVENT.back]: (e) => {
        if (!isTvDevice()) return;
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





  // Auto-hide the controls layer (incl. next/previous) a few seconds after the
  // last interaction. The nonce restarts the timer even when the bar is already
  // open, so tapping "next" re-arms the countdown instead of keeping it visible.
  const [barNonce, setBarNonce] = useState(0);
  useEffect(() => {
    if (!barOpen) return;
    if (paused) return;
    const t = setTimeout(() => setBarOpen(false), 3000);
    return () => clearTimeout(t);
  }, [barOpen, paused, barNonce]);


  const revealBar = () => {
    setBarOpen(true);
    setBarNonce((n) => n + 1);
  };



  return (
    <div data-tv-scope className="fixed inset-0 z-[90] flex flex-col bg-black/95 backdrop-blur-xl md:bg-[#07070b]/97 lg:flex-row lg:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">

      {/* Slim permanent header — never auto-hides */}
        <header className="flex shrink-0 items-center gap-2.5 px-3 py-2 md:border-b md:border-white/10 md:bg-white/[0.03] md:px-5 md:py-2.5 lg:gap-3 lg:py-3">

          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-[10px] font-extrabold text-white lg:h-9 lg:w-9"
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
            <p className="truncate text-sm font-bold leading-tight tracking-tight text-white md:text-base lg:text-lg">
              {channel.name}
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

        {/* Channel zapping inside the picture — the only controls reachable while
            the shell is in fullscreen. */}
        {onZapChannel && !error && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                revealBar();
                onZapChannel(-1);
              }}
              aria-label="Previous channel"
              data-tv
              className={`absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 p-2.5 text-white/85 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/80 hover:text-white active:scale-90 sm:p-3 ${
                barOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                revealBar();
                onZapChannel(1);
              }}
              aria-label="Next channel"
              data-tv
              className={`absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 p-2.5 text-white/85 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/80 hover:text-white active:scale-90 sm:p-3 ${
                barOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              <SkipForward className="h-5 w-5" />
            </button>
          </>
        )}



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

        {loading && !error && !codecIssue && !blocked && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: accent }} />
            <p className="text-[11px] font-semibold tracking-wide text-white/55">
              {retrying
                ? `Reconnecting… (${Math.min(attempt + 2, MAX_STREAM_RETRIES)}/${MAX_STREAM_RETRIES})`
                : 'Connecting to stream…'}
            </p>

          </div>
        )}

        {blocked && !codecIssue && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-7 text-center shadow-2xl backdrop-blur-2xl">
              <span
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(255,176,32,0.16)' }}
              >
                <AlertTriangle className="h-6 w-6" style={{ color: '#ffb020' }} />
              </span>
              <p className="text-sm font-extrabold tracking-tight text-white">{blocked.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">{blocked.detail}</p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  disabled={cooldown > 0}
                  onClick={() => {
                    setBlocked(null);
                    setRetrying(false);
                    setError(false);
                    setStage(0);
                    setAttempt(0);
                    setReload((r) => r + 1);
                  }}
                  className="flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold text-white transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: '#ffb020' }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {cooldown > 0 ? `Retry in ${cooldown}s` : 'Retry'}
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


        {codecIssue && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-7 text-center shadow-2xl backdrop-blur-2xl">
              <span
                className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(255,176,32,0.16)' }}
              >
                <AlertTriangle className="h-6 w-6" style={{ color: '#ffb020' }} />
              </span>
              <p className="text-sm font-extrabold tracking-tight text-white">
                Unsupported codec
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/50">
                This channel is broadcast in {codecIssue}, which this browser cannot decode.
                It plays on Safari, iPhone/iPad, Apple TV and most Smart TVs — or pick the
                SD/H.264 version of the same channel.
              </p>
              <div className="mt-4 flex justify-center">
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

        {error && !codecIssue && !blocked && (

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
                We tried {MAX_STREAM_RETRIES} times without luck. Please try again in a moment,
                or pick another channel.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  onClick={() => {
                    setRetrying(false);
                    setError(false);
                    setStage(0);
                    setAttempt(0);
                    setReload((r) => r + 1);
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
