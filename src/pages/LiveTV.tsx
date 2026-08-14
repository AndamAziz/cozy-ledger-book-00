import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, SignalHigh, AlertTriangle, RotateCw, Server } from 'lucide-react';
import {
  useIptvIndex,
  useIptvRefresh,
  useIptvChannels,
  prefetchIptvCategories,

  useIptvSearch,
  type IptvCategory,
  type IptvChannel,
  IptvRequestError,
} from '@/hooks/useIptvPlaylist';

import { SourcePicker } from '@/components/livetv/SourcePicker';


import { recordProviderSuccess, recordProviderFailure } from '@/lib/iptvProviderStatus';
import { ChannelCard } from '@/components/livetv/ChannelCard';

import { PosterCard } from '@/components/livetv/PosterCard';
import { CategoryAccordion } from '@/components/livetv/CategoryAccordion';
import { LiveTVPlayer } from '@/components/livetv/LiveTVPlayer';
import { LiveBottomNav, type LiveTab } from '@/components/livetv/LiveBottomNav';
import { SeriesDetail } from '@/components/livetv/SeriesDetail';
import { useProviderHealth } from '@/hooks/useIptvHealth';
import { useLiveTvSources } from '@/components/livetv/LiveTvGate';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useIncrementalList } from '@/hooks/useVirtualList';
import { setZapList, zapNeighbour } from '@/lib/zapList';
import { TV_EVENT } from '@/lib/tvRemote';


function tabOf(category: IptvCategory): LiveTab {
  if (category.kind === 'vod') return 'movies';
  if (category.kind === 'series') return 'series';
  if (/REPLAY|CATCH ?UP|ARCHIVE|24\/7/.test(category.name.toUpperCase())) return 'replay';
  return 'direct';
}


const GRID_LIVE = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 2xl:grid-cols-9 sm:gap-3 lg:gap-4';
const GRID_POSTER = 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 2xl:grid-cols-8 sm:gap-3 lg:gap-4';

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

  // A category whose preview already covers the requested page needs no request
  // at all — the provider only allows one connection at a time.
  const coveredByPreview = (category.preview?.length ?? 0) >= Math.min(limit, category.count);
  const { data, isFetching } = useIptvChannels(category.id, visible && !coveredByPreview, limit);
  // The index already carries the first page: show it while the full category
  // request waits its turn on the provider's single connection slot.
  const channels = data?.channels ?? category.preview ?? null;
  const total = data?.total ?? category.count;
  const shown = channels?.length ?? 0;
  const hasMore = total > shown;


  return (
    <section ref={ref}>
      <div className="mb-3 flex items-center gap-3">
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: 'linear-gradient(#ff2d6f,#b026ff)' }} />
        <h2 className="truncate text-sm font-bold tracking-tight">{category.name}</h2>
        {total > 0 && (
          <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/50">
            {total}
          </span>
        )}
        <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
      </div>

      {!channels ? (
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
            {channels.map((channel) =>
              poster ? (
                <PosterCard
                  key={channel.id}
                  channel={{ ...channel, kind }}
                  onPlay={(c) => {
                    setZapList(channels);
                    onPlay(c);
                  }}
                />
              ) : (
                <ChannelCard
                  key={channel.id}
                  channel={{ ...channel, kind }}
                  onPlay={(c) => {
                    setZapList(channels);
                    onPlay(c);
                  }}
                />
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
              Load more ({shown}/{total})
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
  const sources = useLiveTvSources();
  const healthTone =
    health?.status === 'online' || health?.status === 'slot_limit'
      ? { bg: '#28d17c26', fg: '#28d17c', label: 'Online' }
      : health?.status === 'offline'
          ? { bg: '#ff2d6f26', fg: '#ff2d6f', label: 'Offline' }
          : { bg: '#ffffff14', fg: '#ffffff8c', label: 'Checking' };

  // Persist provider reachability so the status widget survives reloads.
  useEffect(() => {
    if (index && !index.warning) recordProviderSuccess(index.total, index.updatedAt);
    else if (index?.warning) recordProviderFailure(index.diagnostic, index.reqId, index.warning);
  }, [index]);
  useEffect(() => {
    if (!error) return;
    const e = error as IptvRequestError;
    recordProviderFailure(e.diagnostic, e.reqId, e.message);
  }, [error]);

  // A catalogue warning is transient (provider slot busy / slow panel). Refresh
  // it silently once instead of pushing a banner at the viewer.
  const warnRetried = useRef(false);
  useEffect(() => {
    if (!index?.warning || warnRetried.current) return;
    warnRetried.current = true;
    const t = setTimeout(() => void refreshCatalogue().catch(() => undefined), 2500);
    return () => clearTimeout(t);
  }, [index?.warning, refreshCatalogue]);




  // Series open a season/episode detail sheet; everything else plays directly.
  // The two surfaces are mutually exclusive so only one player can be mounted.
  const openItem = (c: IptvChannel) => {
    if (c.kind === 'series') {
      setPlaying(null);
      setSeriesItem(c);
    } else {
      setSeriesItem(null);
      setPlaying(c);
    }
  };

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

  // Hundreds of categories are mounted in batches as the user scrolls, so each
  // tab switch paints in one frame instead of building every accordion up front.
  const catWindow = useIncrementalList(categories.length, 12, [tab]);



  // Warm the local cache for the first rows so expanding one paints instantly.
  useEffect(() => {
    if (!categories.length) return;
    const t = setTimeout(() => prefetchIptvCategories(categories.slice(0, 8).map((c) => c.id)), 300);
    return () => clearTimeout(t);
  }, [categories]);

  // Zap within the list the current channel was opened from — used by the
  // in-picture Next/Previous buttons (which stay usable in fullscreen) and by
  // CH+ / CH- from a TV remote or an Xbox pad.
  const zapChannel = (delta: number) => {
    if (!playing) return false;
    const next = zapNeighbour(playing.id, delta);
    if (!next) return false;
    setPlaying({ ...next, kind: playing.kind });
    return true;
  };

  useEffect(() => {
    if (!playing) return;
    const zap = (delta: number) => (e: Event) => {
      const next = zapNeighbour(playing.id, delta);
      if (!next) return;
      e.preventDefault();
      setPlaying({ ...next, kind: playing.kind });
    };
    const up = zap(1);
    const down = zap(-1);
    window.addEventListener(TV_EVENT.channelUp, up);
    window.addEventListener(TV_EVENT.channelDown, down);
    return () => {
      window.removeEventListener(TV_EVENT.channelUp, up);
      window.removeEventListener(TV_EVENT.channelDown, down);
    };
  }, [playing]);

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

      <header className="tv-sticky-safe sticky top-0 z-30 border-b border-white/10 bg-[#07070b]/90 safe-x top-bar-safe pb-3 backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            aria-label="Back home"
            className="shrink-0 rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold tracking-tight">{meta.heading}</h1>
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-white/35">
              {index ? `${categories.length.toLocaleString()} categories` : 'Streaming'}
            </p>
          </div>
          <SourcePicker />
          {sources && (

            <button
              type="button"
              onClick={sources.openSourceManager}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 text-[10px] font-bold leading-none text-white/70 transition hover:border-white/25 hover:text-white active:scale-95 sm:px-3 sm:text-[11px]"
            >
              <Server className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">My sources</span>
            </button>
          )}
          <span
            title={health?.message ?? 'Checking provider…'}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: healthTone.bg, color: healthTone.fg }}
          >
            <SignalHigh className="h-3 w-3" /> {healthTone.label}
          </span>
          <button
            type="button"
            onClick={doRefresh}
            disabled={refreshing}
            aria-label="Reload channel list"
            className="shrink-0 rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90 disabled:opacity-50"
          >
            <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
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

      <main className="wide-shell flex-1 safe-x pt-4 pb-[calc(76px+env(safe-area-inset-bottom))] 2xl:pb-[calc(92px+env(safe-area-inset-bottom))]">




        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/50">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff2d6f]" />
            <p className="text-xs font-semibold">Loading playlist…</p>
          </div>
        )}

        {error && (
          <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-3 px-6 py-24 text-center">
            <AlertTriangle className="h-7 w-7 text-[#ff2d6f]" />
            <p className="text-sm font-bold">Playlist could not be loaded</p>
            <button
              type="button"
              onClick={doRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/80 transition hover:border-white/35 hover:text-white disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Try again
            </button>
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
                  <PosterCard
                    key={channel.id}
                    channel={{ ...channel, kind: playbackKind }}
                    onPlay={(c) => {
                      setZapList(results?.channels);
                      openItem(c);
                    }}
                  />
                ) : (
                  <ChannelCard
                    key={channel.id}
                    channel={{ ...channel, kind: playbackKind }}
                    onPlay={(c) => {
                      setZapList(results?.channels);
                      openItem(c);
                    }}
                  />
                ),
              )}
            </div>
            {results && results.channels.length === 0 && !searchLoading && (
              <p className="py-20 text-center text-xs font-semibold text-white/40">No channels match “{query}”.</p>
            )}
          </section>
        ) : fullCategory ? (
          <CategoryFullView
            category={fullCategory}
            onPlay={openItem}
            onBack={() => setFullCategory(null)}
            kind={playbackKind}
            poster={usePoster}
            gridClass={usePoster ? GRID_POSTER : GRID_LIVE}
          />
        ) : (
          <div className="space-y-3">
            {categories.slice(0, catWindow.limit).map((category) => (
              <CategoryAccordion
                key={category.id}
                category={category}
                onPlay={openItem}
                kind={playbackKind}
                poster={usePoster}
                onSeeAll={setFullCategory}
              />
            ))}
            {catWindow.hasMore && <div ref={catWindow.sentinelRef} style={{ height: 24 }} />}

            {!isLoading && !error && categories.length === 0 && (
              <p className="py-24 text-center text-xs font-semibold text-white/40">No channels in this section.</p>
            )}
          </div>
        )}
      </main>

      <LiveBottomNav active={tab} onChange={(t) => navigate(TAB_META[t].path)} />

      {seriesItem && <SeriesDetail series={seriesItem} onClose={() => setSeriesItem(null)} />}
      {playing && !seriesItem && (
        <ErrorBoundary>
          {/* `key` forces a full remount per channel: the old video element and
              its engine are unmounted instead of being reused mid-stream. */}
          <LiveTVPlayer
            key={playing.id}
            channel={playing}
            onClose={() => setPlaying(null)}
            onZapChannel={playing.kind === 'live' || !playing.kind ? (d) => void zapChannel(d) : undefined}
          />
        </ErrorBoundary>
      )}

    </div>
  );
}
