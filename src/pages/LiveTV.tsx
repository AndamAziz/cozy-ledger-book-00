import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, SignalHigh, AlertTriangle, RotateCw } from 'lucide-react';
import {
  useIptvIndex,
  useIptvRefresh,
  useIptvChannels,
  useIptvSearch,
  type IptvCategory,
  type IptvChannel,
} from '@/hooks/useIptvPlaylist';
import { ChannelCard } from '@/components/livetv/ChannelCard';
import { PosterCard } from '@/components/livetv/PosterCard';
import { CategoryAccordion } from '@/components/livetv/CategoryAccordion';
import { LiveTVPlayer } from '@/components/livetv/LiveTVPlayer';
import { LiveBottomNav, type LiveTab } from '@/components/livetv/LiveBottomNav';
import { SeriesDetail } from '@/components/livetv/SeriesDetail';
import { useProviderHealth } from '@/hooks/useIptvHealth';

function tabOf(category: IptvCategory): LiveTab {
  if (category.kind === 'vod') return 'movies';
  if (category.kind === 'series') return 'series';
  if (/REPLAY|CATCH ?UP|ARCHIVE|24\/7/.test(category.name.toUpperCase())) return 'replay';
  return 'direct';
}


const GRID_LIVE = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8';
const GRID_POSTER = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7';

function CategorySection({
  category,
  onPlay,
  eager,
  kind,
  poster,
}: {
  category: IptvCategory;
  onPlay: (c: IptvChannel) => void;
  eager: boolean;
  kind: 'live' | 'vod' | 'series';
  poster: boolean;
}) {
  const gridClass = poster ? GRID_POSTER : GRID_LIVE;
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(eager);
  // Paginate inside a category so huge groups never render thousands of nodes.
  const [limit, setLimit] = useState(24);

  useEffect(() => {
    if (visible || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setVisible(true),
      { rootMargin: '300px' },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  const { data, isLoading, isFetching } = useIptvChannels(category.id, visible, limit);
  const shown = data?.channels.length ?? 0;
  const hasMore = !!data && data.total > shown;

  return (
    <section ref={ref}>
      <div className="mb-3 flex items-center gap-3">
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: 'linear-gradient(#ff2d6f,#b026ff)' }} />
        <h2 className="truncate text-sm font-bold tracking-tight">{category.name}</h2>
        {(data?.total ?? category.count) > 0 && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/50">
            {data?.total ?? category.count}
          </span>
        )}
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>

      {isLoading || !data ? (
        <div className={gridClass}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-2xl border border-white/5 bg-white/[0.03] ${poster ? 'h-[190px]' : 'h-[124px]'}`}
            />
          ))}
        </div>
      ) : (
        <>
          <div className={gridClass}>
            {data.channels.map((channel) =>
              poster ? (
                <PosterCard key={channel.id} channel={{ ...channel, kind }} onPlay={onPlay} />
              ) : (
                <ChannelCard key={channel.id} channel={{ ...channel, kind }} onPlay={onPlay} />
              ),
            )}
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + 36)}
              disabled={isFetching}
              className="mx-auto mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              {isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
              Load more ({shown}/{data.total})
            </button>
          )}
        </>
      )}
    </section>
  );
}


const TAB_META: Record<LiveTab, { path: string; title: string; heading: string; description: string }> = {
  direct: {
    path: '/live-tv',
    title: 'Live TV & Sports Streaming | City Taxperts',
    heading: 'Live TV',
    description: 'Watch live sports, Kurdish satellite channels, news and entertainment in one sleek streaming player.',
  },
  movies: {
    path: '/live-tv/movies',
    title: 'Movies | Live TV | City Taxperts',
    heading: 'Movies',
    description: 'Stream on-demand movies from the Live TV library in a fast, mobile-friendly player.',
  },
  series: {
    path: '/live-tv/series',
    title: 'Series | Live TV | City Taxperts',
    heading: 'Series',
    description: 'Browse and stream TV series and shows from the Live TV library.',
  },
  replay: {
    path: '/live-tv/replay',
    title: 'Replay | Live TV | City Taxperts',
    heading: 'Replay',
    description: 'Catch up on replays, archives and 24/7 channels from the Live TV library.',
  },
};

export default function LiveTV({ tab = 'direct' }: { tab?: LiveTab }) {
  const { data: index, isLoading, error } = useIptvIndex();
  const refreshCatalogue = useIptvRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCatalogue();
    } finally {
      setRefreshing(false);
    }
  };
  const navigate = useNavigate();
  const meta = TAB_META[tab];
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<IptvChannel | null>(null);
  const [seriesItem, setSeriesItem] = useState<IptvChannel | null>(null);
  const [fullCategory, setFullCategory] = useState<IptvCategory | null>(null);
  const { data: health } = useProviderHealth();
  const healthTone =
    health?.status === 'online' || health?.status === 'slot_limit'
      ? { bg: '#28d17c26', fg: '#28d17c', label: 'Online' }
      : health?.status === 'offline'
          ? { bg: '#ff2d6f26', fg: '#ff2d6f', label: 'Offline' }
          : { bg: '#ffffff14', fg: '#ffffff8c', label: 'Checking' };

  // Series open a season/episode detail sheet; everything else plays directly.
  const openItem = (c: IptvChannel) => (c.kind === 'series' ? setSeriesItem(c) : setPlaying(c));

  // Movies / Series / Replay items are on-demand containers, not live channels.
  const playbackKind: 'live' | 'vod' | 'series' =
    tab === 'direct' ? 'live' : tab === 'series' ? 'series' : 'vod';
  const searchSection: 'live' | 'vod' | 'series' =
    tab === 'movies' ? 'vod' : tab === 'series' ? 'series' : 'live';
  const searching = query.trim().length >= 2;
  const { data: results, isFetching: searchLoading } = useIptvSearch(query, searchSection);


  const usePoster = tab === 'movies' || tab === 'series';

  const categories = useMemo(
    () => (index?.categories ?? []).filter((c) => tabOf(c) === tab),
    [index, tab],
  );

  // Switching tabs returns to the category list.
  useEffect(() => {
    setFullCategory(null);
  }, [tab]);




  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#07070b] text-white">
      <Helmet>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={meta.path} />
      </Helmet>

      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#07070b]/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-3">
          <Link
            to="/"
            aria-label="Back home"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold tracking-tight">{meta.heading}</h1>
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-white/35">
              {index ? `${categories.length.toLocaleString()} categories` : 'Streaming'}
            </p>
          </div>
          <button
            type="button"
            onClick={doRefresh}
            disabled={refreshing}
            aria-label="Reload channel list"
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90 disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <span
            title={health?.message ?? 'Checking provider…'}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: healthTone.bg, color: healthTone.fg }}
          >
            <SignalHigh className="h-3 w-3" /> {healthTone.label}
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels…"
            dir="ltr"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.05] pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-[#ff2d6f]/60"
          />
        </div>
      </header>

      <main className="flex-1 px-4 pb-6 pt-4">



        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/50">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff2d6f]" />
            <p className="text-xs font-semibold">Loading playlist…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <AlertTriangle className="h-7 w-7 text-[#ff2d6f]" />
            <p className="text-sm font-bold">Playlist could not be loaded</p>
            <p className="text-xs text-white/45">{(error as Error).message}</p>
          </div>
        )}

        {searching ? (
          <section>
            <div className="mb-3 flex items-center gap-3">
              <span className="h-4 w-1 rounded-full" style={{ background: 'linear-gradient(#ff2d6f,#b026ff)' }} />
              <h2 className="text-sm font-bold tracking-tight">Search results</h2>
              {results && (
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/50">
                  {results.total}
                </span>
              )}
            </div>
            {searchLoading && <Loader2 className="mx-auto my-10 h-6 w-6 animate-spin text-[#ff2d6f]" />}
            <div className={usePoster ? GRID_POSTER : GRID_LIVE}>
              {results?.channels.map((channel) =>
                usePoster ? (
                  <PosterCard key={channel.id} channel={{ ...channel, kind: playbackKind }} onPlay={openItem} />
                ) : (
                  <ChannelCard key={channel.id} channel={{ ...channel, kind: playbackKind }} onPlay={openItem} />
                ),
              )}
            </div>
            {results && results.channels.length === 0 && !searchLoading && (
              <p className="py-20 text-center text-xs font-semibold text-white/40">No channels match “{query}”.</p>
            )}
          </section>
        ) : fullCategory ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setFullCategory(null)}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-[11px] font-bold text-white/80 transition hover:border-[#b026ff]/60 hover:text-white"
            >
              <ArrowLeft className="h-3 w-3" /> Categories
            </button>
            <CategorySection
              category={fullCategory}
              onPlay={openItem}
              eager
              kind={playbackKind}
              poster={usePoster}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <CategoryAccordion
                key={category.id}
                category={category}
                onPlay={openItem}
                kind={playbackKind}
                poster={usePoster}
                onSeeAll={setFullCategory}
              />
            ))}

            {!isLoading && !error && categories.length === 0 && (
              <p className="py-24 text-center text-xs font-semibold text-white/40">No channels in this section.</p>
            )}
          </div>
        )}
      </main>

      <LiveBottomNav active={tab} onChange={(t) => navigate(TAB_META[t].path)} />

      {seriesItem && <SeriesDetail series={seriesItem} onClose={() => setSeriesItem(null)} />}
      {playing && <LiveTVPlayer channel={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
