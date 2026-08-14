import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Search, X } from 'lucide-react';
import { useIptvChannels, type IptvCategory, type IptvChannel } from '@/hooks/useIptvPlaylist';
import { ChannelCard } from './ChannelCard';
import { PosterCard } from './PosterCard';
import { setZapList } from '@/lib/zapList';
import { getSeeAllState, seeAllKey, setSeeAllState } from '@/lib/seeAllCache';

interface Props {
  category: IptvCategory;
  kind: 'live' | 'vod' | 'series';
  poster: boolean;
  gridClass: string;
  onPlay: (c: IptvChannel) => void;
  onBack: () => void;
}

const PAGE = 60;

/**
 * "See All" view for one category.
 *
 * Loads a large first page, then keeps growing automatically as the user scrolls
 * (with a manual "Load more" fallback for TV remotes), so every movie/series in
 * the category is reachable instead of stopping at the preview strip.
 */
export function CategoryFullView({ category, kind, poster, gridClass, onPlay, onBack }: Props) {
  const cacheKey = seeAllKey(kind, category.id);
  const cached = getSeeAllState(cacheKey);
  const [limit, setLimit] = useState(cached?.limit || PAGE);
  const [q, setQ] = useState(cached?.q ?? '');
  const sentinel = useRef<HTMLDivElement | null>(null);
  const restored = useRef(false);

  // Switching category resumes from that category's remembered depth (or page 1).
  useEffect(() => {
    const prev = getSeeAllState(seeAllKey(kind, category.id));
    setLimit(prev?.limit || PAGE);
    setQ(prev?.q ?? '');
    restored.current = false;
  }, [category.id, kind]);

  // Persist paging depth + filter so returning here hits the React Query cache.
  useEffect(() => {
    setSeeAllState(cacheKey, { limit, q });
  }, [cacheKey, limit, q]);

  const { data, isFetching, isError, error, refetch } = useIptvChannels(category.id, true, limit);
  const channels = data?.channels ?? category.preview ?? null;
  const total = data?.total ?? category.count;
  const shown = channels?.length ?? 0;
  const hasMore = shown > 0 && shown < total;

  // Restore scroll position once the cached grid is painted.
  useEffect(() => {
    if (restored.current || shown === 0) return;
    restored.current = true;
    const y = getSeeAllState(cacheKey)?.scrollY ?? 0;
    if (y > 0) requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [cacheKey, shown]);

  // Remember where the user was reading.
  useEffect(() => {
    const onScroll = () => setSeeAllState(cacheKey, { scrollY: window.scrollY });
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      setSeeAllState(cacheKey, { scrollY: window.scrollY });
      window.removeEventListener('scroll', onScroll);
    };
  }, [cacheKey]);

  const visible = useMemo(() => {
    if (!channels) return null;
    const needle = q.trim().toLowerCase();
    return needle ? channels.filter((c) => c.name.toLowerCase().includes(needle)) : channels;
  }, [channels, q]);

  // Auto-grow while the sentinel is in view (one page at a time, never parallel).
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || isFetching || q.trim()) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => Math.min(total, l + PAGE));
      },
      { rootMargin: '700px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, isFetching, total, q]);

  const play = (c: IptvChannel) => {
    setZapList(channels ?? undefined);
    onPlay(c);
  };

  const pct = total > 0 ? Math.min(100, Math.round((shown / total) * 100)) : 0;

  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-20 -mx-1 space-y-3 rounded-2xl border border-white/10 bg-black/60 px-3 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/80 transition hover:border-[#b026ff]/60 hover:text-white"
          >
            <ArrowLeft className="h-3 w-3" /> Categories
          </button>
          <h2 className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight">{category.name}</h2>
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/60">
            {shown}/{total}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter loaded items…"
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-white placeholder:text-white/35 focus:outline-none"
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear filter" className="shrink-0 text-white/50">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="h-0.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
          />
        </div>
      </div>

      {isError && !channels ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-xs font-semibold text-white/50">
            {(error as Error)?.message ?? 'Could not load this category.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-[11px] font-bold text-white/80"
          >
            Retry
          </button>
        </div>
      ) : !visible ? (
        <div className={gridClass}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${poster ? 'h-[190px]' : 'h-[124px]'}`}
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="py-20 text-center text-xs font-semibold text-white/40">Nothing matches this filter.</p>
      ) : (
        <>
          <div className={gridClass}>
            {visible.map((channel) =>
              poster ? (
                <PosterCard key={channel.id} channel={{ ...channel, kind }} onPlay={play} />
              ) : (
                <ChannelCard key={channel.id} channel={{ ...channel, kind }} onPlay={play} />
              ),
            )}
          </div>

          <div ref={sentinel} className="h-1" />

          {hasMore ? (
            <button
              type="button"
              onClick={() => setLimit((l) => Math.min(total, l + PAGE))}
              disabled={isFetching}
              className="mx-auto flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 py-2 text-[11px] font-bold text-white/80 transition hover:border-[#b026ff]/60 hover:text-white disabled:opacity-50"
            >
              {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ff2d6f]" />}
              {isFetching ? 'Loading…' : `Load more (${shown}/${total})`}
            </button>
          ) : (
            shown > 0 && (
              <p className="pb-4 text-center text-[11px] font-semibold text-white/35">All {total} items loaded</p>
            )
          )}
        </>
      )}
    </section>
  );
}
