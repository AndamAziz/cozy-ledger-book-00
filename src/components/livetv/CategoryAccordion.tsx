import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useIptvChannels, type IptvCategory, type IptvChannel } from '@/hooks/useIptvPlaylist';
import { ChannelCard } from './ChannelCard';
import { PosterCard } from './PosterCard';
import { CategoryStatusBadge } from './CategoryStatusBadge';
import { useCategoryHealth } from '@/hooks/useCategoryHealth';

interface Props {
  category: IptvCategory;
  kind: 'live' | 'vod' | 'series';
  poster: boolean;
  onPlay: (c: IptvChannel) => void;
  onSeeAll: (c: IptvCategory) => void;
}

const PREVIEW_LIMIT = 12;

/** Collapsible category row with a horizontal preview strip and a "See All" action. */
export function CategoryAccordion({ category, kind, poster, onPlay, onSeeAll }: Props) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error, refetch } = useIptvChannels(category.id, open, PREVIEW_LIMIT);
  // Live categories get a periodically re-probed health verdict (sampled channels).
  const health = useCategoryHealth(category.id, data?.channels, kind, kind === 'live');

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.05]"
      >
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: 'linear-gradient(#ff2d6f,#b026ff)' }} />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight">{category.name}</h2>
        {(data?.total ?? category.count) > 0 && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/50">
            {data?.total ?? category.count}
          </span>
        )}
        {kind === 'live' && (
          <CategoryStatusBadge categoryId={category.id} health={health} stale={health.stale} />
        )}
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-white/45 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/10 px-3 py-3">
            {isLoading || !data ? (
              <div className="flex items-center gap-2 py-6 text-xs font-semibold text-white/45">
                <Loader2 className="h-4 w-4 animate-spin text-[#ff2d6f]" /> Loading…
              </div>
            ) : data.channels.length === 0 ? (
              <p className="py-6 text-center text-xs font-semibold text-white/40">No items in this category.</p>
            ) : (
              <>
                <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {data.channels.map((channel) => (
                    <div key={channel.id} className={`shrink-0 ${poster ? 'w-[112px]' : 'w-[96px]'}`}>
                      {poster ? (
                        <PosterCard channel={{ ...channel, kind }} onPlay={onPlay} />
                      ) : (
                        <ChannelCard channel={{ ...channel, kind }} onPlay={onPlay} />
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => onSeeAll(category)}
                  className="mt-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-bold text-white/80 transition hover:border-[#b026ff]/60 hover:text-white"
                >
                  See All ({data.total})
                  <ChevronRight className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
