import { Radio } from 'lucide-react';
import type { IptvChannel } from '@/hooks/useIptvPlaylist';
import { useProviderHealth } from '@/hooks/useIptvHealth';
import { HealthBadge } from './HealthBadge';
import { useLogoFallback } from '@/lib/logoFallback';


const ACCENTS = ['#ff2d6f', '#b026ff', '#ff7a18', '#00d4ff', '#28d17c', '#f0b90b'];

export function accentFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initialsFor(name: string) {
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return 'TV';
  const first = words[0];
  if (/^[A-Za-z]+\d+$/.test(first)) return first.slice(0, 4).toUpperCase();
  if (words.length === 1) return first.slice(0, 3).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface Props {
  channel: IptvChannel;
  onPlay: (channel: IptvChannel) => void;
}

export function ChannelCard({ channel, onPlay }: Props) {
  const logo = useLogoFallback(channel.logo);
  const accent = accentFor(channel.name);

  const { data: provider } = useProviderHealth();
  const nameOffline = /offline|no signal|\bnot working\b/i.test(channel.name);
  const status = nameOffline
    ? 'offline'
    : provider?.status === 'offline'
      ? 'offline'
      : provider?.status === 'slot_limit'
        ? 'busy'
        : provider?.status === 'online'
          ? 'online'
          : 'unknown';


  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      className="group relative flex w-full flex-col items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 active:scale-[0.97]"
      style={{ boxShadow: `0 8px 24px -14px ${accent}` }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 -top-10 h-20 opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
        style={{ background: `radial-gradient(circle, ${accent}, transparent 70%)` }}
      />

      <span
        className="relative z-10 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl text-sm font-extrabold tracking-tight text-white"
        style={{
          background: logo.src ? 'rgba(0,0,0,0.35)' : `linear-gradient(140deg, ${accent}, ${accent}55)`,
        }}
      >
        {logo.src ? (
          <img
            key={logo.src}
            src={logo.src}
            alt={`${channel.name} logo`}
            loading="lazy"
            className="h-full w-full object-contain p-1"
            onError={logo.onError}
          />
        ) : (
          initialsFor(channel.name)
        )}
      </span>


      <span className="relative z-10 line-clamp-2 min-h-[2.1rem] text-[11px] font-semibold leading-tight text-white/90">
        {channel.name}
      </span>

      {status === 'unknown' ? (
        <span
          className="relative z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ background: `${accent}26`, color: accent }}
        >
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          Live
        </span>
      ) : (
        <HealthBadge status={status} className="relative z-10" />
      )}

      <Radio className="pointer-events-none absolute right-2 top-2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" style={{ color: accent }} />
    </button>
  );
}
