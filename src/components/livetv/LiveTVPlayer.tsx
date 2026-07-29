import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Loader2, AlertTriangle, Maximize2 } from 'lucide-react';
import { toPlayableUrl, type IptvChannel } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';

interface Props {
  channel: IptvChannel;
  onClose: () => void;
}

export function LiveTVPlayer({ channel, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const accent = accentFor(channel.name);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const src = toPlayableUrl(channel.url);
    setStatus('loading');

    let hls: Hls | null = null;

    const play = () => video.play().catch(() => undefined);

    if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
        enableWorker: true,
        backBufferLength: 30,
        maxBufferLength: 12,
        liveSyncDurationCount: 2,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls?.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
        else setStatus('error');
      });
    } else {
      video.src = src;
      play();
    }

    const onPlaying = () => setStatus('playing');
    const onWaiting = () => setStatus((s) => (s === 'error' ? s : 'loading'));
    const onError = () => setStatus('error');
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('error', onError);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [channel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
            <p className="text-xs text-white/50">The stream may be offline. Try another channel.</p>
            <button
              onClick={onClose}
              className="mt-2 rounded-full bg-[#ff2d6f] px-5 py-2 text-xs font-bold text-white active:scale-95"
            >
              Back to channels
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
