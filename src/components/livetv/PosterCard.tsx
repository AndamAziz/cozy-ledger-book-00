import { useState } from 'react';
import { Clapperboard } from 'lucide-react';
import type { IptvChannel } from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { useChannelHealth, useProviderHealth } from '@/hooks/useIptvHealth';
import { HealthBadge } from './HealthBadge';

interface Props {
  channel: IptvChannel;
  onPlay: (channel: IptvChannel) => void;
}

/** Tall 2:3 poster tile used for Movies / Series / Replay items. */
export function PosterCard({ channel, onPlay }: Props) {
  const [failed, setFailed] = useState(false);
  const accent = accentFor(channel.name);
  const showPoster = !!channel.logo && !failed;
  const { data: provider } = useProviderHealth();
  // Series are containers (no direct stream), so only probe playable items.
  const probeable = channel.kind !== 'series' && provider?.status === 'online';
  const health = useChannelHealth(channel, probeable);
  const status =
    channel.kind === 'series'
      ? 'unknown'
      : provider?.status === 'offline'
        ? 'offline'
        : provider?.status === 'slot_limit'
          ? 'busy'
          : health;

  return (
    <button
      type="button"
      onClick={() => onPlay(channel)}
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 active:scale-[0.97]"
      style={{ boxShadow: `0 10px 28px -18px ${accent}` }}
    >
      <span className="relative block w-full overflow-hidden" style={{ aspectRatio: '2 / 3' }}>
        {showPoster ? (
          <img
            src={channel.logo as string}
            alt={`${channel.name} poster`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            onError={() => setFailed(true)}
          />
        ) : (
          <span
            className="flex h-full w-full flex-col items-center justify-center gap-1.5"
            style={{ background: `linear-gradient(150deg, ${accent}, ${accent}22)` }}
          >
            <Clapperboard className="h-6 w-6 text-white/80" />
            <span className="text-sm font-extrabold tracking-tight text-white">{initialsFor(channel.name)}</span>
          </span>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent" />
        <HealthBadge status={status} className="absolute left-1.5 top-1.5 backdrop-blur-md" />
      </span>

      <span className="line-clamp-2 min-h-[2.2rem] px-2 py-2 text-[11px] font-semibold leading-tight text-white/90">
        {channel.name}
      </span>
    </button>
  );
}
