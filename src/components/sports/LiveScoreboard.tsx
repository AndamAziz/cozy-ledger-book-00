import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, ChevronDown, AlertCircle } from 'lucide-react';

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
const LEAGUE_TABS: { id: number | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 2, label: 'UCL' },
  { id: 39, label: 'Premier League' },
  { id: 140, label: 'La Liga' },
  { id: 135, label: 'Serie A' },
  { id: 78, label: 'Bundesliga' },
  { id: 61, label: 'Ligue 1' },
  { id: 1, label: 'World Cup' },
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
    <div className="border-b border-border/40 bg-background/95">
      {/* Heading + manual refresh */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
          </span>
          <h3 className="text-sm font-bold text-foreground">Live Scores</h3>
          <span className="text-[10px] text-muted-foreground">
            {filtered.length > 0 ? `${filtered.length} live` : ''}
          </span>
        </div>
        <button
          onClick={fetchLive}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted/60 transition-colors"
          aria-label="Refresh scores"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* League filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 no-scrollbar">
        {LEAGUE_TABS.map((tab) => (
          <button
            key={String(tab.id)}
            onClick={() => setLeague(tab.id)}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              league === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-3 pb-2.5">
        {error === 'missing_api_key' ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>Live scores need a sports data API key. Ask the admin to add it.</span>
          </div>
        ) : loading && matches.length === 0 ? (
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] w-44 flex-shrink-0 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
            No live matches right now.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {filtered.map((m) => {
              const st = statusInfo(m.fixture.status.short, m.fixture.status.elapsed);
              const isExpanded = expanded === m.fixture.id;
              return (
                <div
                  key={m.fixture.id}
                  className={`flex-shrink-0 rounded-xl border border-border/50 bg-card transition-all ${
                    isExpanded ? 'w-72' : 'w-48'
                  }`}
                >
                  <button
                    onClick={() => toggleExpand(m.fixture.id)}
                    className="w-full p-2.5 text-start"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                      <span className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                        {m.league.name}
                      </span>
                      {st.kind === 'live' ? (
                        <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                          </span>
                          {st.label}
                        </span>
                      ) : st.kind === 'ht' ? (
                        <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
                          HT
                        </span>
                      ) : st.kind === 'finished' ? (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                          FT
                        </span>
                      ) : (
                        <span className="rounded-full bg-info/15 px-1.5 py-0.5 text-[9px] font-bold text-info">
                          {kickoffTime(m.fixture.date)}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <img src={m.teams.home.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" loading="lazy" />
                          <span className="truncate text-xs font-medium text-foreground">{m.teams.home.name}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground">{m.goals.home ?? '-'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <img src={m.teams.away.logo} alt="" className="h-4 w-4 flex-shrink-0 object-contain" loading="lazy" />
                          <span className="truncate text-xs font-medium text-foreground">{m.teams.away.name}</span>
                        </div>
                        <span className="text-sm font-bold text-foreground">{m.goals.away ?? '-'}</span>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-center">
                      <ChevronDown
                        className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/40 px-2.5 py-2">
                      {eventsLoading === m.fixture.id ? (
                        <p className="text-center text-[11px] text-muted-foreground">Loading…</p>
                      ) : (events[m.fixture.id]?.length ?? 0) === 0 ? (
                        <p className="text-center text-[11px] text-muted-foreground">No events yet.</p>
                      ) : (
                        <ul className="space-y-1">
                          {events[m.fixture.id].map((ev, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 text-[11px]">
                              <span className="w-7 flex-shrink-0 font-bold text-muted-foreground">
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
