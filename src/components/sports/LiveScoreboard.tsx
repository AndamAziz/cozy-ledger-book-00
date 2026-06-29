import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ChevronDown, AlertCircle, Trophy, Flag, Globe, Star, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ---- Types (subset of API-Football response) ----
interface ApiTeam {
  id: number;
  name: string;
  logo: string;
}
interface ApiFixture {
  fixture: {
    id: number;
    date: string;
    status: { long: string; short: string; elapsed: number | null };
  };
  league: { id: number; name: string; country: string; logo: string; round: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
}
interface ApiEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string };
  player: { name: string | null };
  assist: { name: string | null };
  type: string; // Goal | Card | subst
  detail: string;
}

// ---- League filter tabs (API-Football league IDs) ----
const LEAGUE_TABS: { id: number | 'all'; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All', icon: Globe },
  { id: 2, label: 'UCL', icon: Star },
  { id: 39, label: 'Premier League', icon: Flag },
  { id: 140, label: 'La Liga', icon: Flag },
  { id: 135, label: 'Serie A', icon: Flag },
  { id: 78, label: 'Bundesliga', icon: Flag },
  { id: 61, label: 'Ligue 1', icon: Flag },
  { id: 1, label: 'World Cup', icon: Trophy },
];

const LIVE_SHORTS = new Set(['1H', '2H', 'ET', 'P', 'BT', 'LIVE', 'INT']);
const FINISHED_SHORTS = new Set(['FT', 'AET', 'PEN']);

function statusInfo(short: string, elapsed: number | null) {
  if (short === 'HT') return { kind: 'ht', label: 'HT' };
  if (FINISHED_SHORTS.has(short)) return { kind: 'finished', label: 'FT' };
  if (LIVE_SHORTS.has(short)) return { kind: 'live', label: elapsed != null ? `${elapsed}'` : 'LIVE' };
  return { kind: 'upcoming', label: 'NS' };
}

function kickoffTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const REFRESH_MS = 20000;

export function LiveScoreboard() {
  const [matches, setMatches] = useState<ApiFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<number | 'all'>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [events, setEvents] = useState<Record<number, ApiEvent[]>>({});
  const [eventsLoading, setEventsLoading] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('sports-scores', {
        body: { action: 'live' },
      });
      if (fnErr) throw fnErr;
      if (data?.error === 'missing_api_key') {
        setError('missing_api_key');
        setMatches([]);
        return;
      }
      setError(null);
      setMatches(Array.isArray(data?.response) ? data.response : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    timerRef.current = setInterval(fetchLive, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchLive]);

  const toggleExpand = useCallback(
    async (fixtureId: number) => {
      if (expanded === fixtureId) {
        setExpanded(null);
        return;
      }
      setExpanded(fixtureId);
      if (!events[fixtureId]) {
        setEventsLoading(fixtureId);
        try {
          const { data } = await supabase.functions.invoke('sports-scores', {
            body: { action: 'events', fixtureId },
          });
          setEvents((prev) => ({
            ...prev,
            [fixtureId]: Array.isArray(data?.response) ? data.response : [],
          }));
        } catch {
          setEvents((prev) => ({ ...prev, [fixtureId]: [] }));
        } finally {
          setEventsLoading(null);
        }
      }
    },
    [expanded, events],
  );

  const filtered = league === 'all' ? matches : matches.filter((m) => m.league.id === league);

  return (
    <div className="relative border-b border-white/5 bg-gradient-to-b from-background to-card/40">
      {/* Heading + manual refresh */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-destructive/25 to-destructive/5 shadow-sm shadow-destructive/10">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
            </span>
          </span>
          <h3 className="text-sm font-bold tracking-tight text-foreground">Live Scores</h3>
          {filtered.length > 0 && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              {filtered.length} live
            </span>
          )}
        </div>
        <button
          onClick={fetchLive}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground active:scale-90"
          aria-label="Refresh scores"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* League filter tabs with fade edges */}
      <div className="relative">
        <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 no-scrollbar scroll-smooth snap-x">
          {LEAGUE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = league === tab.id;
            return (
              <button
                key={String(tab.id)}
                onClick={() => setLeague(tab.id)}
                className={`group flex flex-shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all duration-300 ease-out active:scale-95 ${
                  active
                    ? 'bg-gradient-to-r from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/30'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 transition-colors ${active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`} strokeWidth={2.2} />
                {tab.label}
              </button>
            );
          })}
        </div>
        {/* Edge fades hint that more tabs exist */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="pb-3">
        {error === 'missing_api_key' ? (
          <div className="mx-3 flex items-center gap-2 rounded-2xl border border-white/5 bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Live scores need a sports data API key. Ask the admin to add it.</span>
          </div>
        ) : loading && matches.length === 0 ? (
          <div className="flex gap-3 overflow-hidden px-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[96px] w-[80%] max-w-[260px] flex-shrink-0 animate-pulse rounded-2xl bg-muted/30" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-3 rounded-2xl border border-white/5 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
            No live matches right now.
          </div>
        ) : (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-3 px-3 pb-1 no-scrollbar scroll-smooth">
            {filtered.map((m) => {
              const st = statusInfo(m.fixture.status.short, m.fixture.status.elapsed);
              const isExpanded = expanded === m.fixture.id;
              const hg = m.goals.home;
              const ag = m.goals.away;
              const homeLeading = hg != null && ag != null && hg > ag;
              const awayLeading = hg != null && ag != null && ag > hg;
              return (
                <div
                  key={m.fixture.id}
                  className={`group flex-shrink-0 snap-start overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-secondary/80 via-card to-card shadow-lg shadow-black/30 transition-all duration-300 ${
                    isExpanded ? 'w-[88%] max-w-[300px]' : 'w-[80%] max-w-[260px]'
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(m.fixture.id)}
                    className="w-full p-3.5 text-start transition-colors active:bg-white/[0.02]"
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-1.5">
                      <span className="min-w-0 flex-1 truncate rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {m.league.name}
                      </span>
                      {st.kind === 'live' ? (
                        <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-destructive to-orange-500 px-2 py-0.5 text-[9px] font-bold text-destructive-foreground shadow-sm shadow-destructive/30">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                          </span>
                          {st.label}
                        </span>
                      ) : st.kind === 'ht' ? (
                        <span className="flex-shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                          HT
                        </span>
                      ) : st.kind === 'finished' ? (
                        <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                          FT
                        </span>
                      ) : (
                        <span className="flex-shrink-0 rounded-full bg-info/15 px-2 py-0.5 text-[9px] font-bold text-info">
                          {kickoffTime(m.fixture.date)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 rounded-lg transition-colors group-active:bg-white/[0.02]">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/5">
                            <img src={m.teams.home.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />
                          </span>
                          <span className={`truncate text-[13px] ${homeLeading ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}>{m.teams.home.name}</span>
                        </div>
                        <span className={`flex-shrink-0 text-xl font-extrabold tabular-nums ${homeLeading ? 'text-primary' : 'text-foreground'}`}>{hg ?? '-'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-lg transition-colors group-active:bg-white/[0.02]">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/5">
                            <img src={m.teams.away.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />
                          </span>
                          <span className={`truncate text-[13px] ${awayLeading ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`}>{m.teams.away.name}</span>
                        </div>
                        <span className={`flex-shrink-0 text-xl font-extrabold tabular-nums ${awayLeading ? 'text-primary' : 'text-foreground'}`}>{ag ?? '-'}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-center">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5">
                        <ChevronDown
                          className={`h-3 w-3 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180 text-primary' : ''}`}
                        />
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="animate-fade-in border-t border-white/5 bg-black/20 px-3.5 py-2.5">
                      {eventsLoading === m.fixture.id ? (
                        <p className="text-center text-[11px] text-muted-foreground">Loading…</p>
                      ) : (events[m.fixture.id]?.length ?? 0) === 0 ? (
                        <p className="text-center text-[11px] text-muted-foreground">No events yet.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {events[m.fixture.id].map((ev, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                              <span className="w-7 flex-shrink-0 font-bold text-primary">
                                {ev.time.elapsed ?? '?'}&apos;
                              </span>
                              <span className="flex-shrink-0">
                                {ev.type === 'Goal' ? '⚽' : ev.type === 'Card' ? (ev.detail.includes('Red') ? '🟥' : '🟨') : ev.type === 'subst' ? '🔁' : '•'}
                              </span>
                              <span className="min-w-0 text-foreground">
                                <span className="font-medium">{ev.player.name ?? ev.team.name}</span>
                                {ev.type === 'subst' && ev.assist.name ? ` ↔ ${ev.assist.name}` : ''}
                                {ev.type === 'Goal' && ev.assist.name ? ` (${ev.assist.name})` : ''}
                                <span className="text-muted-foreground"> · {ev.team.name}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
