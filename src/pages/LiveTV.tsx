import { useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, SignalHigh, AlertTriangle } from 'lucide-react';
import { useIptvPlaylist, type IptvChannel, type IptvGroup } from '@/hooks/useIptvPlaylist';
import { ChannelCard } from '@/components/livetv/ChannelCard';
import { LiveTVPlayer } from '@/components/livetv/LiveTVPlayer';
import { LiveBottomNav, type LiveTab } from '@/components/livetv/LiveBottomNav';

const MAX_PER_GROUP = 60;

function tabOf(group: string): LiveTab {
  const g = group.toUpperCase();
  if (/SERIES|SERIE|زنجیره/.test(g)) return 'series';
  if (/VOD|MOVIE|FILM|CINEMA/.test(g)) return 'movies';
  if (/REPLAY|CATCH ?UP|ARCHIVE/.test(g)) return 'replay';
  return 'direct';
}

export default function LiveTV() {
  const { data, isLoading, error } = useIptvPlaylist();
  const [tab, setTab] = useState<LiveTab>('direct');
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<IptvChannel | null>(null);

  const groups: IptvGroup[] = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.groups
      .filter((g) => tabOf(g.name) === tab)
      .map((g) => ({
        ...g,
        channels: q ? g.channels.filter((c) => c.name.toLowerCase().includes(q)) : g.channels,
      }))
      .filter((g) => g.channels.length > 0);
  }, [data, tab, query]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#07070b] text-white">
      <Helmet>
        <title>Live TV & Sports Streaming | City Taxperts</title>
        <meta
          name="description"
          content="Watch live sports, Kurdish satellite channels, news and entertainment in one sleek streaming player."
        />
        <link rel="canonical" href="/live-tv" />
      </Helmet>

      {/* Header */}
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
            <h1 className="truncate text-base font-extrabold tracking-tight">Live TV</h1>
            <p className="truncate text-[10px] uppercase tracking-[0.2em] text-white/35">
              {data ? `${data.total} channels` : 'Streaming'}
            </p>
          </div>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: '#ff2d6f26', color: '#ff2d6f' }}
          >
            <SignalHigh className="h-3 w-3" /> HD
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

      {/* Content */}
      <main className="flex-1 px-4 pb-6 pt-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-white/50">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff2d6f]" />
            <p className="text-xs font-semibold">Loading playlist…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 px-6 text-center">
            <AlertTriangle className="h-7 w-7 text-[#ff2d6f]" />
            <p className="text-sm font-bold">Playlist could not be loaded</p>
            <p className="text-xs text-white/45">{(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !error && groups.length === 0 && (
          <p className="py-24 text-center text-xs font-semibold text-white/40">No channels in this section.</p>
        )}

        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.name}>
              <div className="mb-3 flex items-center gap-3">
                <span className="h-4 w-1 rounded-full" style={{ background: 'linear-gradient(#ff2d6f,#b026ff)' }} />
                <h2 className="truncate text-sm font-bold tracking-tight">{group.name}</h2>
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/50">
                  {group.count}
                </span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>

              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {group.channels.slice(0, MAX_PER_GROUP).map((channel) => (
                  <ChannelCard key={channel.id} channel={channel} onPlay={setPlaying} />
                ))}
              </div>

              {group.channels.length > MAX_PER_GROUP && (
                <p className="mt-2 text-[10px] text-white/30">
                  Showing {MAX_PER_GROUP} of {group.channels.length} — refine with search.
                </p>
              )}
            </section>
          ))}
        </div>
      </main>

      <LiveBottomNav active={tab} onChange={setTab} />

      {playing && <LiveTVPlayer channel={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
