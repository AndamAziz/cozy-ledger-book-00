import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import M3uStreamView from '@/components/livetv/M3uStreamView';
import { ChannelLogo } from '@/components/livetv/ChannelLogo';
import type { StreamHeaders } from '@/lib/streamHeaders';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tv, Trash2, Search, Loader2, Play, Signal, ArrowLeft,
  ListVideo, CheckCircle2, AlertTriangle, Save, Gauge,
  ChevronDown, Clapperboard, ShieldCheck, Settings2,
} from 'lucide-react';


const DEFAULT_PLAYLIST = 'https://iptv-org.github.io/iptv/countries/br.m3u';
const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iptv-m3u-proxy?url=`;

interface Channel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
  /** Optional custom HTTP headers detected in the playlist (needs proxying). */
  headers?: StreamHeaders | null;
}


interface Playlist {
  id: string;
  name: string;
  url: string;
  last_status: string | null;
  last_latency_ms: number | null;
  channel_count: number | null;
  is_active: boolean;
}

interface TestResult {
  ok: boolean;
  status: string;
  latency_ms: number;
  channel_count?: number;
}

const latencyTone = (ms: number) =>
  ms < 400 ? 'text-success' : ms < 1200 ? 'text-accent' : 'text-destructive';

/** VOD items (movies/series files) get poster tiles; live channels get logo tiles. */
const isMovieItem = (c?: Channel) =>
  !!c && (/\.(mp4|mkv|avi|mov)(\?|$)/i.test(c.url) || /movie|film|vod|series|cinema/i.test(c.group));


export default function M3uTV() {
  const { language } = useLanguage();
  const ku = language !== 'en';
  const { toast } = useToast();
  const navigate = useNavigate();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [activeGroup, setActiveGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Channel | null>(null);
  // Only the CEO account manages playlist links (add / delete).
  // Every other signed-in user sees the same shared playlists, read-only.
  const [isCeo, setIsCeo] = useState(false);
  const ceoRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const ceo = (data.user?.email ?? '').toLowerCase() === 'andam@outlook.com';
      setIsCeo(ceo);
      ceoRef.current = ceo;
    });
  }, []);

  // Top banner is a permanent slim bar — it never auto-hides so the active
  // server + channel count stay visible while browsing or watching.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);







  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);


  const T = {
    title: ku ? 'تەلەڤیزیۆنی ڕاستەوخۆ' : 'LIVE TV',
    subtitle: ku ? 'بینینی کەناڵەکانی IPTV بە ڕاستەوخۆ' : 'Watch IPTV channels live',
    playlists: ku ? 'پلەیلیستەکان' : 'Playlists',
    addNew: ku ? 'زیادکردنی لینکی نوێ' : 'Add new link',
    nameHolder: ku ? 'ناوی پلەیلیست' : 'Playlist name',
    urlHolder: ku ? 'لینکی M3U' : 'M3U link',
    test: ku ? 'تاقیکردنەوە' : 'Test',
    save: ku ? 'پاشەکەوت' : 'Save',
    search: ku ? 'گەڕان بەدوای کەناڵ...' : 'Search channels...',
    all: ku ? 'هەموو' : 'All',
    channels: ku ? 'کەناڵ' : 'channels',
    categories: ku ? 'بەش' : 'categories',

    noChannels: ku ? 'هیچ کەناڵێک نەدۆزرایەوە' : 'No channels found',
    selectHint: ku ? 'کەناڵێک هەڵبژێرە بۆ بینین' : 'Pick a channel to start watching',
    online: ku ? 'چالاک' : 'Online',
    offline: ku ? 'ناچالاک' : 'Offline',
    invalid: ku ? 'لینک هەڵەیە' : 'Invalid link',
    playError: ku ? 'ئەم کەناڵە کار ناکات، کەناڵێکی تر تاقی بکەرەوە' : 'This channel is unavailable, try another',
    loadingChannels: ku ? 'کەناڵەکان دەهێنرێن...' : 'Loading channels...',
    deleted: ku ? 'سڕایەوە' : 'Deleted',
    saved: ku ? 'پاشەکەوت کرا' : 'Saved',
    needTest: ku ? 'سەرەتا لینکەکە تاقی بکەرەوە' : 'Test the link first',
    retry: ku ? 'دووبارە' : 'Retry',
    live: ku ? 'ڕاستەوخۆ' : 'LIVE',
    back: ku ? 'گەڕانەوە' : 'Back',
    choose: ku ? 'پلەیلیست هەڵبژێرە' : 'Choose playlist',
    manage: ku ? 'بەڕێوەبردنی لینکەکان (CEO)' : 'Manage links (CEO)',
    movies: ku ? 'فیلمەکان' : 'Movies',
    visibleHint: ku ? 'تیک لەو سێرڤەرانە بکە کە دەتەوێت بەکارهێنەران بیانبینن' : 'Tick the servers users are allowed to see',
    ceoOnly: ku ? 'تەنها بەڕێوەبەری سەرەکی دەتوانێت لینک زیاد بکات' : 'Only the CEO can add or delete links',
  };


  /* ---------------- playlists ---------------- */

  const fetchPlaylists = useCallback(async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const ceo = (userRes.user?.email ?? '').toLowerCase() === 'andam@outlook.com';
    ceoRef.current = ceo;
    const { data } = await supabase
      .from('iptv_playlists')
      .select('id,name,url,last_status,last_latency_ms,channel_count,is_active')
      .order('created_at', { ascending: true });
    // Viewers only see the servers the CEO ticked; the CEO sees every row.
    const rows = ((data as Playlist[]) || []).filter((p) => ceo || p.is_active !== false);
    setPlaylists(rows);
    return rows;
  }, []);

  /** CEO-only: tick/untick a server so it shows up for all other users. */
  const toggleVisible = async (pl: Playlist) => {
    const next = !pl.is_active;
    setPlaylists((list) => list.map((p) => (p.id === pl.id ? { ...p, is_active: next } : p)));
    const { error } = await supabase.from('iptv_playlists').update({ is_active: next }).eq('id', pl.id);
    if (error) {
      setPlaylists((list) => list.map((p) => (p.id === pl.id ? { ...p, is_active: !next } : p)));
      toast({ title: T.offline, variant: 'destructive' });
    }
  };


  /** Pulls the whole playlist, page by page, so 40k+ channel sources arrive complete. */
  const fetchAllChannels = useCallback(
    async (
      url: string,
      onPage?: (channels: Channel[], groups: string[], total: number) => void,
      refresh = false,
    ): Promise<{ channels: Channel[]; groups: string[]; latency: number; total: number } | null> => {
      const PAGE = 4000;
      const out: Channel[] = [];
      let groups: string[] = [];
      let latency = 0;
      let total = 0;

      for (let offset = 0; offset < 200_000; offset += PAGE) {
        const { data, error } = await supabase.functions.invoke('iptv-m3u-playlist', {
          body: { action: 'load', url, offset, limit: PAGE, refresh: refresh && offset === 0 },
        });
        if (error) throw error;
        if (!data?.ok) return offset === 0 ? null : { channels: out, groups, latency, total };
        const page = (data.channels as Channel[]) || [];
        out.push(...page);
        if (Array.isArray(data.groups) && data.groups.length) groups = data.groups;
        latency = data.latency_ms ?? latency;
        total = data.total ?? data.channel_count ?? out.length;
        onPage?.(out.slice(), groups, total);
        if (!data.has_more || page.length === 0) break;
      }
      return { channels: out, groups, latency, total };
    },
    [],
  );

  const loadPlaylist = useCallback(
    async (pl: { id: string; url: string }) => {
      setLoading(true);
      setActiveId(pl.id);
      setActiveGroup('all');
      setQuery('');
      try {
        let first = true;
        const res = await fetchAllChannels(pl.url, (chans, grps) => {
          setChannels(chans);
          if (grps.length) setGroups(grps);
          // Show the first page immediately; later pages stream in behind it.
          if (first) {
            first = false;
            setLoading(false);
          }
        });
        if (!res) {
          setChannels([]);
          setGroups([]);
          toast({ title: T.offline, variant: 'destructive' });
          return;
        }
        // Only the CEO may write playlist stats back (shared rows are read-only
        // for everyone else), so skip the update for normal viewers.
        if (pl.id !== 'default' && ceoRef.current) {
          await supabase
            .from('iptv_playlists')
            .update({
              last_status: 'online',
              last_latency_ms: res.latency,
              channel_count: res.total,
            })
            .eq('id', pl.id);
          fetchPlaylists();
        }
      } catch {
        toast({ title: T.offline, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [fetchAllChannels, fetchPlaylists, toast],
  );


  useEffect(() => {
    (async () => {
      const list = await fetchPlaylists();
      if (list.length) {
        loadPlaylist(list[0]);
        return;
      }
      // Seeding the first shared playlist is a CEO-only write.
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      const isCeoUser = (userRes.user?.email ?? '').toLowerCase() === 'andam@outlook.com';
      if (uid && isCeoUser) {
        const { data: inserted } = await supabase
          .from('iptv_playlists')
          .insert({ user_id: uid, name: 'Brazil', url: DEFAULT_PLAYLIST })
          .select('id,name,url,last_status,last_latency_ms,channel_count,is_active')
          .maybeSingle();
        if (inserted) {
          setPlaylists([inserted as Playlist]);
          loadPlaylist(inserted as Playlist);
          return;
        }
      }
      loadPlaylist({ id: 'default', url: DEFAULT_PLAYLIST });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- auto-sync with the provider ---------------- */

  const activeUrl = useMemo(
    () => playlists.find((p) => p.id === activeId)?.url ?? '',
    [playlists, activeId],
  );
  const syncingRef = useRef(false);

  /** Silently re-reads the whole active source and merges any newly added channels. */
  const syncActive = useCallback(
    async (url: string) => {
      if (!url || syncingRef.current) return;
      syncingRef.current = true;
      try {
        // refresh=true bypasses the server cache so brand-new channels appear at once.
        const res = await fetchAllChannels(url, undefined, true);
        const fresh = res?.channels ?? [];
        if (fresh.length) {
          setChannels((prev) => {
            if (!prev.length) return fresh;
            const seen = new Set(prev.map((c) => c.url));
            const added = fresh.filter((c) => !seen.has(c.url));
            return added.length ? [...prev, ...added] : prev;
          });
          if (res?.groups.length) setGroups(res.groups);
        }
      } catch {
        /* background sync stays silent */
      } finally {
        syncingRef.current = false;
      }
    },
    [fetchAllChannels],
  );


  useEffect(() => {
    if (!activeUrl) return;
    const tick = () => {
      if (document.visibilityState === 'visible') void syncActive(activeUrl);
    };
    const id = window.setInterval(tick, 2 * 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [activeUrl, syncActive]);



  const runTest = async (url: string, silent = false) => {
    if (!url.trim()) return null;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('iptv-m3u-playlist', {
        body: { action: 'test', url: url.trim() },
      });
      if (error) throw error;
      setTestResult(data as TestResult);
      if (!silent) {
        toast({
          title: data.ok ? `${T.online} · ${data.latency_ms}ms` : T.offline,
          description: data.ok ? `${data.channel_count} ${T.channels}` : undefined,
          variant: data.ok ? 'default' : 'destructive',
        });
      }
      return data as TestResult;
    } catch {
      toast({ title: T.offline, variant: 'destructive' });
      return null;
    } finally {
      setTesting(false);
    }
  };

  const savePlaylist = async () => {
    if (!newUrl.trim()) return;
    const result = testResult ?? (await runTest(newUrl, true));
    if (!result?.ok) {
      toast({ title: T.needTest, variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) {
      setSaving(false);
      return;
    }
    const { data, error } = await supabase
      .from('iptv_playlists')
      .insert({
        user_id: uid,
        name: newName.trim() || new URL(newUrl.trim()).hostname,
        url: newUrl.trim(),
        last_status: 'online',
        last_latency_ms: result.latency_ms,
        channel_count: result.channel_count ?? null,
      })
      .select('id,name,url,last_status,last_latency_ms,channel_count,is_active')
      .maybeSingle();
    setSaving(false);
    if (error || !data) {
      toast({ title: T.offline, variant: 'destructive' });
      return;
    }
    setPlaylists((p) => [...p, data as Playlist]);
    setNewName('');
    setNewUrl('');
    setTestResult(null);
    toast({ title: T.saved });
    loadPlaylist(data as Playlist);
  };

  const removePlaylist = async (id: string) => {
    await supabase.from('iptv_playlists').delete().eq('id', id);
    setPlaylists((p) => p.filter((x) => x.id !== id));
    toast({ title: T.deleted });
  };

  /* ---------------- player ---------------- */

  const playChannel = (ch: Channel) => setCurrent(ch);

  /* ---------------- derived ---------------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      (c) =>
        (activeGroup === 'all' || c.group === activeGroup) &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [channels, activeGroup, query]);

  const groupChannels = useMemo(
    () => (activeGroup === 'all' ? channels : channels.filter((c) => c.group === activeGroup)),
    [channels, activeGroup],
  );

  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    channels.forEach((c) => {
      map[c.group] = (map[c.group] || 0) + 1;
    });
    return map;
  }, [channels]);

  /** Split the visible items into per-category sections (max 300 items shown). */
  const sections = useMemo(() => {
    const map = new Map<string, Channel[]>();
    filtered.slice(0, 300).forEach((c) => {
      const key = c.group || 'Other';
      const list = map.get(key);
      if (list) list.push(c);
      else map.set(key, [c]);
    });
    return [...map.entries()].map(([name, items]) => ({
      name,
      items,
      movie: isMovieItem(items[0]),
    }));
  }, [filtered]);


  /* ---------------- ui ---------------- */

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <Helmet>
        <title>IPTV Live TV Player | City Taxperts</title>
        <meta name="description" content="Add your own M3U playlists and watch IPTV channels live in the browser." />
        <link rel="canonical" href="/iptv" />
      </Helmet>

      <div className="wide-shell page-shell space-y-4 py-4 sm:space-y-5 sm:py-5">
        {/* Slim persistent header — always visible, never auto-hides */}
        <div className="sticky top-0 z-30 -mx-1 flex items-center gap-2 rounded-full border border-destructive/25 bg-card/70 px-2 py-1.5 shadow-sm backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            aria-label={T.back}
            className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-destructive to-pink-500">
            <Tv className="h-3.5 w-3.5 text-destructive-foreground" />
          </span>
          <h1 className="shrink-0 text-[13px] font-extrabold leading-none">{T.title}</h1>
          <Badge variant="destructive" className="h-4 shrink-0 px-1.5 text-[9px] leading-none">{T.live}</Badge>
          <p className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted-foreground">
            {playlists.find((p) => p.id === activeId)?.name ?? T.subtitle}
            {Object.keys(groupCounts).length > 0 && ` · ${Object.keys(groupCounts).length} ${T.categories}`}
          </p>
          <span className="shrink-0 rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-bold leading-none">
            {channels.length.toLocaleString()} <span className="font-medium text-muted-foreground">{T.channels}</span>
          </span>
        </div>


        {/* Searchable group + channel pickers */}
        {channels.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Popover open={groupPickerOpen} onOpenChange={setGroupPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={groupPickerOpen}
                className="h-11 w-full justify-between gap-2 rounded-xl bg-card/60 backdrop-blur sm:w-64"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ListVideo className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-semibold">
                    {activeGroup === 'all'
                      ? `${ku ? 'هەموو بەشەکان' : 'All categories'} (${Object.keys(groupCounts).length})`
                      : activeGroup}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[min(92vw,24rem)] p-0" dir={ku ? 'rtl' : 'ltr'}>
              <Command>
                <CommandInput placeholder={ku ? 'گەڕان بەدوای بەش...' : 'Search categories...'} />
                <CommandList className="max-h-72">
                  <CommandEmpty>{ku ? 'هیچ بەشێک نەدۆزرایەوە' : 'No categories found'}</CommandEmpty>
                  <CommandGroup heading={`${Object.keys(groupCounts).length} ${T.categories}`}>
                    <CommandItem
                      value="__all__ all categories"
                      onSelect={() => {
                        setActiveGroup('all');
                        setGroupPickerOpen(false);
                      }}
                      className="gap-2"
                    >
                      <span className="truncate text-xs font-semibold">
                        {ku ? 'هەموو بەشەکان' : 'All categories'}
                      </span>
                      <span className="ms-auto text-[10px] text-muted-foreground">
                        {channels.length.toLocaleString()}
                      </span>
                    </CommandItem>
                    {Object.entries(groupCounts)
                      .sort((a, b) => b[1] - a[1])
                      .map(([g, n]) => (
                        <CommandItem
                          key={g}
                          value={g}
                          onSelect={() => {
                            setActiveGroup(g);
                            setGroupPickerOpen(false);
                          }}
                          className="gap-2"
                        >
                          <span className="truncate text-xs font-semibold">{g}</span>
                          <span className="ms-auto text-[10px] text-muted-foreground">{n}</span>
                        </CommandItem>
                      ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="h-11 w-full justify-between gap-2 rounded-xl bg-card/60 backdrop-blur"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-semibold">
                    {current ? current.name : T.search}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[min(92vw,32rem)] p-0"
              dir={ku ? 'rtl' : 'ltr'}
            >
              <Command>
                <CommandInput placeholder={T.search} />
                <CommandList className="max-h-72">
                  <CommandEmpty>{T.noChannels}</CommandEmpty>
                  <CommandGroup
                    heading={`${groupChannels.length.toLocaleString()} ${T.channels}${
                      activeGroup === 'all' ? '' : ` · ${activeGroup}`
                    }`}
                  >
                    {groupChannels.slice(0, 800).map((ch, i) => (
                      <CommandItem
                        key={`${ch.url}-${i}`}
                        value={`${ch.name} ${ch.group}`}
                        onSelect={() => {
                          setCurrent(ch);
                          setPickerOpen(false);
                        }}
                        className="gap-2"
                      >
                        <ChannelLogo
                          logo={ch.logo}
                          name={ch.name}
                          className="h-6 w-6 shrink-0"
                        />
                        <span className="truncate text-xs font-semibold">{ch.name}</span>
                        <span className="ms-auto truncate text-[10px] text-muted-foreground">
                          {ch.group}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        )}


        {/* Built-in stream view */}
        {current && (
          <M3uStreamView
            channel={current}
            channels={filtered}
            playlistName={playlists.find((p) => p.id === activeId)?.name ?? T.title}
            ku={ku}
            onSelect={(ch) => setCurrent(ch)}
            onClose={() => setCurrent(null)}
          />
        )}


        {!current && (
          <Card className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
            <Play className="h-8 w-8" />
            <p className="text-xs font-semibold">{T.selectHint}</p>
          </Card>
        )}

        {/* Source management — CEO only, hidden and unreachable for other users */}
        {isCeo && (
          <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <ListVideo className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">{T.playlists}</h2>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ms-auto min-w-[190px] justify-between gap-2">
                  <span className="truncate">
                    {playlists.find((p) => p.id === activeId)?.name ?? T.choose}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs">{T.playlists}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {playlists.map((pl) => (
                  <DropdownMenuItem
                    key={pl.id}
                    onSelect={() => loadPlaylist(pl)}
                    className="flex items-center gap-2"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${activeId === pl.id ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    <span className="truncate text-xs font-semibold">{pl.name}</span>
                    <span className="ms-auto flex items-center gap-2 text-[10px]">
                      {pl.channel_count != null && (
                        <span className="text-muted-foreground">{pl.channel_count}</span>
                      )}
                      {pl.last_latency_ms != null && (
                        <span className={latencyTone(pl.last_latency_ms)}>{pl.last_latency_ms}ms</span>
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
                {playlists.length === 0 && (
                  <DropdownMenuItem disabled className="text-xs">
                    {T.noChannels}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Collapsible management panel */}
          <Collapsible defaultOpen={false} className="mt-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between gap-2 px-2 text-xs font-semibold">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-3.5 w-3.5 text-primary" />
                    {T.manage}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3 data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                <p className="text-[11px] font-semibold text-muted-foreground">{T.visibleHint}</p>
                <div className="flex flex-wrap gap-2">
                  {playlists.map((pl) => (
                    <span
                      key={pl.id}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                        activeId === pl.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'
                      } ${pl.is_active === false ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        checked={pl.is_active !== false}
                        onCheckedChange={() => toggleVisible(pl)}
                        aria-label={T.visibleHint}
                        className="h-3.5 w-3.5"
                      />
                      <button type="button" onClick={() => loadPlaylist(pl)} className="font-semibold">
                        {pl.name}
                      </button>
                      <button
                        type="button"
                        aria-label="delete"
                        onClick={() => removePlaylist(pl.id)}
                        className="opacity-50 transition hover:text-destructive hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
                  <p className="text-xs font-bold text-muted-foreground">{T.addNew}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={T.nameHolder}
                      className="h-9 text-sm"
                    />
                    <Input
                      value={newUrl}
                      onChange={(e) => {
                        setNewUrl(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder={T.urlHolder}
                      dir="ltr"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => runTest(newUrl)} disabled={testing || !newUrl.trim()}>
                      {testing ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Gauge className="me-1.5 h-3.5 w-3.5" />}
                      {T.test}
                    </Button>
                    <Button size="sm" onClick={savePlaylist} disabled={saving || !newUrl.trim()}>
                      {saving ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="me-1.5 h-3.5 w-3.5" />}
                      {T.save}
                    </Button>
                    {testResult && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold">
                        {testResult.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        {testResult.ok ? T.online : testResult.status === 'invalid' ? T.invalid : T.offline}
                        <span className={latencyTone(testResult.latency_ms)}>{testResult.latency_ms}ms</span>
                        {testResult.channel_count != null && (
                          <span className="text-muted-foreground">
                            · {testResult.channel_count} {T.channels}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </CollapsibleContent>
          </Collapsible>
          </Card>
        )}



        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={T.search}
            className="h-10 ps-9"
          />
        </div>

        {/* Channels — grouped section by section */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-xs font-semibold">{T.loadingChannels}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-xs font-semibold text-muted-foreground">{T.noChannels}</p>
        ) : (
          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.name} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      section.movie
                        ? 'bg-gradient-to-br from-primary to-accent'
                        : 'bg-gradient-to-br from-destructive to-pink-500'
                    }`}
                  >
                    {section.movie ? (
                      <Clapperboard className="h-4 w-4 text-primary-foreground" />
                    ) : (
                      <Tv className="h-4 w-4 text-destructive-foreground" />
                    )}
                  </span>
                  <h3 className="truncate text-sm font-extrabold">{section.name}</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {section.items.length} {section.movie ? T.movies : T.channels}
                  </Badge>
                  <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                </div>

                {section.movie ? (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
                    {section.items.map((ch, i) => (
                      <button
                        key={`${ch.url}-${i}`}
                        type="button"
                        onClick={() => playChannel(ch)}
                        className={`group relative overflow-hidden rounded-xl border text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                          current?.url === ch.url ? 'border-primary ring-2 ring-primary/40' : 'border-border/60'
                        }`}
                      >
                        <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: '2 / 3' }}>
                          <ChannelLogo
                            name={ch.name}
                            logo={ch.logo}
                            className="flex h-full w-full items-center justify-center overflow-hidden"
                            imageClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            placeholderClassName="h-7 w-7 text-muted-foreground"
                          />
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background/95 to-transparent" />
                          <span className="absolute inset-0 flex items-center justify-center bg-background/40 opacity-0 backdrop-blur-[1px] transition-opacity group-hover:opacity-100">
                            <Play className="h-7 w-7 text-primary" />
                          </span>
                        </div>
                        <p className="line-clamp-2 min-h-[2.1rem] px-2 py-1.5 text-[11px] font-semibold leading-tight">
                          {ch.name}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
                    {section.items.map((ch, i) => (
                      <button
                        key={`${ch.url}-${i}`}
                        type="button"
                        onClick={() => playChannel(ch)}
                        className={`group relative overflow-hidden rounded-xl border p-2 text-center transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          current?.url === ch.url
                            ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                            : 'border-border/60 bg-card hover:border-primary/50'
                        }`}
                      >
                        <div className="mx-auto mb-1.5 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                          <ChannelLogo
                            name={ch.name}
                            logo={ch.logo}
                            className="flex h-full w-full items-center justify-center overflow-hidden"
                            imageClassName="h-full w-full object-contain p-1.5"
                            placeholderClassName="h-5 w-5 text-muted-foreground"
                          />
                        </div>
                        <p className="line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-tight">{ch.name}</p>
                        <span className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Play className="h-4 w-4 text-primary" />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
