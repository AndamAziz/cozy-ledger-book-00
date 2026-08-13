import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Clapperboard, Loader2, Play } from 'lucide-react';
import {
  useIptvSeriesInfo,
  type IptvChannel,
  type IptvEpisode,
} from '@/hooks/useIptvPlaylist';
import { accentFor, initialsFor } from './ChannelCard';
import { LiveTVPlayer } from './LiveTVPlayer';
import { firstAvailableEpisode } from '@/lib/iptvSlotRetry';
import ErrorBoundary from '@/components/ErrorBoundary';


interface Props {
  series: IptvChannel;
  onClose: () => void;
}

/** Build the playable channel object for one episode. */
function episodeChannel(series: IptvChannel, ep: IptvEpisode): IptvChannel {
  return {
    id: ep.id,
    name: `${series.name} · S${ep.season}E${ep.episode}${ep.title ? ` — ${ep.title}` : ''}`,
    logo: ep.cover ?? series.logo,
    group: series.group,
    kind: 'series',
    ext: ep.ext,
  };
}

/** Series detail sheet: season selector, episode grid and seamless in-place playback. */
export function SeriesDetail({ series, onClose }: Props) {
  const { data, isLoading, error } = useIptvSeriesInfo(series.id);
  const accent = accentFor(series.name);
  const [seasonNum, setSeasonNum] = useState<number | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<IptvEpisode | null>(null);
  // Episodes already refused by the provider's session limit during this visit.
  const exhaustedRef = useRef<Set<string>>(new Set());

  const seasons = data?.seasons ?? [];
  useEffect(() => {
    if (seasonNum === null && seasons.length) setSeasonNum(seasons[0].season);
  }, [seasons, seasonNum]);

  const episodes = useMemo(
    () => seasons.find((s) => s.season === seasonNum)?.episodes ?? [],
    [seasons, seasonNum],
  );

  const playEpisode = useCallback((ep: IptvEpisode) => {
    exhaustedRef.current.delete(ep.id);
    setCurrentEpisode(ep);
  }, []);

  // The provider ran out of viewing slots for this episode: hop to the first
  // episode of the season that hasn't hit the limit yet.
  const handleSlotLimit = useCallback(() => {
    const current = currentEpisode;
    if (current) exhaustedRef.current.add(current.id);
    const next = firstAvailableEpisode(episodes, exhaustedRef.current);
    if (next && next.id !== current?.id) {
      setCurrentEpisode(next);
      return;
    }
    exhaustedRef.current.clear();
    setCurrentEpisode(null);
  }, [currentEpisode, episodes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !currentEpisode && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, currentEpisode]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-[#07070b] text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-[#07070b]/90 px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
        <button
          onClick={onClose}
          aria-label="Back to series"
          className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white active:scale-90"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-extrabold tracking-tight">{data?.name ?? series.name}</h2>
          <p className="truncate text-[10px] uppercase tracking-[0.2em] text-white/35">{series.group}</p>
        </div>
      </header>

      <div className="flex-1 px-4 pb-24 pt-4">
        <div className="mb-5 flex gap-4">
          <span
            className="flex h-[132px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 text-sm font-extrabold"
            style={{ background: `linear-gradient(150deg, ${accent}, ${accent}22)` }}
          >
            {data?.cover || series.logo ? (
              <img src={(data?.cover ?? series.logo) as string} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-1">
                <Clapperboard className="h-5 w-5 text-white/80" />
                {initialsFor(series.name)}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            {data?.plot && <p className="line-clamp-5 text-[11px] leading-relaxed text-white/55">{data.plot}</p>}
            {seasons.length > 0 && (
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
                {seasons.length} season{seasons.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-20 text-white/50">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff2d6f]" />
            <p className="text-xs font-semibold">Loading episodes…</p>
          </div>
        )}

        {error && !isLoading && <div className="py-20" aria-hidden="true" />}




        {seasons.length > 0 && (
          <>
            {/* Season selector: tabs on wide screens, dropdown on narrow ones */}
            <div className="mb-4 flex items-center gap-2">
              <div className="relative sm:hidden">
                <select
                  value={seasonNum ?? ''}
                  onChange={(e) => setSeasonNum(Number(e.target.value))}
                  aria-label="Select season"
                  className="appearance-none rounded-xl border border-white/15 bg-white/[0.06] py-2 pl-3 pr-9 text-xs font-bold text-white outline-none"
                >
                  {seasons.map((s) => (
                    <option key={s.season} value={s.season} className="bg-[#07070b]">
                      Season {s.season} ({s.episodes.length})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              </div>
              <div className="hidden gap-2 overflow-x-auto sm:flex">
                {seasons.map((s) => (
                  <button
                    key={s.season}
                    onClick={() => setSeasonNum(s.season)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
                      s.season === seasonNum
                        ? 'border-[#ff2d6f] bg-[#ff2d6f]/15 text-white'
                        : 'border-white/10 bg-white/[0.05] text-white/60 hover:text-white'
                    }`}
                  >
                    Season {s.season}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {episodes.map((ep) => {
                const active = ep.id === currentEpisode?.id;
                return (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => playEpisode(ep)}
                    className={`group flex items-center gap-3 rounded-2xl border p-2 text-left transition active:scale-[0.98] ${
                      active
                        ? 'border-[#ff2d6f] bg-[#ff2d6f]/10'
                        : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                    }`}
                  >
                    <span
                      className="relative flex h-[52px] w-[92px] shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-extrabold"
                      style={{ background: `linear-gradient(150deg, ${accent}, ${accent}22)` }}
                    >
                      {ep.cover ? (
                        <img src={ep.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <Clapperboard className="h-4 w-4 text-white/80" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition group-hover:opacity-100">
                        <Play className="h-4 w-4 fill-white text-white" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-extrabold text-white/90">
                        E{ep.episode}
                        {ep.duration ? <span className="ml-2 text-white/35">{ep.duration}</span> : null}
                      </span>
                      <span className="block truncate text-[11px] text-white/60">{ep.title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {currentEpisode && (
        <ErrorBoundary>
          <LiveTVPlayer
            key={currentEpisode.id}
            channel={episodeChannel(series, currentEpisode)}
            onClose={() => setCurrentEpisode(null)}
            episodes={episodes}
            currentEpisodeId={currentEpisode.id}
            onSelectEpisode={playEpisode}
            onSlotLimit={handleSlotLimit}
          />
        </ErrorBoundary>
      )}

    </div>
  );
}
