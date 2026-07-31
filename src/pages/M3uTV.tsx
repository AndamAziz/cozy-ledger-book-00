import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
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
  ChevronDown, Clapperboard, ShieldCheck,
} from 'lucide-react';


const DEFAULT_PLAYLIST = 'https://iptv-org.github.io/iptv/countries/br.m3u';
const PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/iptv-m3u-proxy?url=`;

interface Channel {
  name: string;
  logo: string | null;
  group: string;
  url: string;
}

interface Playlist {
  id: string;
  name: string;
  url: string;
  last_status: string | null;
  last_latency_ms: number | null;
  channel_count: number | null;
}

interface TestResult {
  ok: boolean;
  status: string;
  latency_ms: number;
  channel_count?: number;
}

const latencyTone = (ms: number) =>
  ms < 400 ? 'text-success' : ms < 1200 ? 'text-accent' : 'text-destructive';

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
  const [playerError, setPlayerError] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  // Only the CEO account manages playlist links (add / delete).
  const [isCeo, setIsCeo] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsCeo((data.user?.email ?? '').toLowerCase() === 'andam@outlook.com');
    });
  }, []);



  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);

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
  };

  /* ---------------- playlists ---------------- */

  const fetchPlaylists = useCallback(async () => {
    const { data } = await supabase
      .from('iptv_playlists')
      .select('id,name,url,last_status,last_latency_ms,channel_count')
      .order('created_at', { ascending: true });
    setPlaylists((data as Playlist[]) || []);
    return (data as Playlist[]) || [];
  }, []);

  const loadPlaylist = useCallback(
    async (pl: { id: string; url: string }) => {
      setLoading(true);
      setActiveId(pl.id);
      setActiveGroup('all');
      setQuery('');
      try {
        const { data, error } = await supabase.functions.invoke('iptv-m3u-playlist', {
          body: { action: 'load', url: pl.url },
        });
        if (error) throw error;
        if (!data?.ok) {
          setChannels([]);
          setGroups([]);
          toast({ title: T.offline, variant: 'destructive' });
          return;
        }
        setChannels(data.channels || []);
        setGroups(data.groups || []);
        if (pl.id !== 'default') {
          await supabase
            .from('iptv_playlists')
            .update({
              last_status: 'online',
              last_latency_ms: data.latency_ms,
              channel_count: data.channel_count,
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
    [fetchPlaylists, toast],
  );

  useEffect(() => {
    (async () => {
      const list = await fetchPlaylists();
      if (list.length) {
        loadPlaylist(list[0]);
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (uid) {
        const { data: inserted } = await supabase
          .from('iptv_playlists')
          .insert({ user_id: uid, name: 'Brazil', url: DEFAULT_PLAYLIST })
          .select('id,name,url,last_status,last_latency_ms,channel_count')
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
      .select('id,name,url,last_status,last_latency_ms,channel_count')
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

  const playChannel = (ch: Channel) => {
    setCurrent(ch);
    setUseProxy(false);
    setPlayerError(false);
    setPlayerLoading(true);
    setTimeout(() => playerBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;

    hlsRef.current?.destroy();
    hlsRef.current = null;

    const src = useProxy ? `${PROXY_BASE}${encodeURIComponent(current.url)}` : current.url;
    if (Hls.isSupported() && src.includes('.m3u8')) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20 });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlayerLoading(false);
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          hls.destroy();
          if (!useProxy) {
            setUseProxy(true);
          } else {
            setPlayerLoading(false);
            setPlayerError(true);
          }
        }
      });
    } else {
      video.src = src;
      video
        .play()
        .then(() => setPlayerLoading(false))
        .catch(() => {
          if (!useProxy) {
            setUseProxy(true);
          } else {
            setPlayerLoading(false);
            setPlayerError(true);
          }
        });
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [current, useProxy]);

  /* ---------------- derived ---------------- */

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter(
      (c) =>
        (activeGroup === 'all' || c.group === activeGroup) &&
        (!q || c.name.toLowerCase().includes(q)),
    );
  }, [channels, activeGroup, query]);

  const groupCounts = useMemo(() => {
    const map: Record<string, number> = {};
    channels.forEach((c) => {
      map[c.group] = (map[c.group] || 0) + 1;
    });
    return map;
  }, [channels]);

  /* ---------------- ui ---------------- */

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <Helmet>
        <title>IPTV Live TV Player | City Taxperts</title>
        <meta name="description" content="Add your own M3U playlists and watch IPTV channels live in the browser." />
        <link rel="canonical" href="/iptv" />
      </Helmet>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-5">
        {/* Hero */}
        <Card className="flex items-center gap-4 border-destructive/30 bg-gradient-to-br from-destructive/15 via-primary/10 to-transparent p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} aria-label={T.back}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-destructive to-pink-500 shadow-md">
            <Tv className="h-6 w-6 text-destructive-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-extrabold">{T.title}</h1>
              <Badge variant="destructive" className="text-[10px]">{T.live}</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">{T.subtitle}</p>
          </div>
          <div className="text-end">
            <p className="text-lg font-extrabold">{channels.length}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{T.channels}</p>
          </div>
        </Card>

        {/* Player */}
        <div ref={playerBoxRef}>
          <Card className="overflow-hidden">
            <div className="relative aspect-video w-full bg-black">
              {current ? (
                <>
                  <video
                    ref={videoRef}
                    controls
                    autoPlay
                    playsInline
                    className="h-full w-full bg-black"
                  />
                  {playerLoading && !playerError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}
                  {playerError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                      <AlertTriangle className="h-7 w-7 text-destructive" />
                      <p className="text-xs font-semibold text-white">{T.playError}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPlayerError(false);
                          setPlayerLoading(true);
                          setUseProxy(false);
                        }}
                      >
                        <Play className="me-1.5 h-3.5 w-3.5" />
                        {T.retry}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Play className="h-8 w-8" />
                  <p className="text-xs font-semibold">{T.selectHint}</p>
                </div>
              )}
            </div>
            {current && (
              <div className="flex items-center gap-3 p-3">
                {current.logo ? (
                  <img src={current.logo} alt={current.name} loading="lazy" className="h-9 w-9 rounded object-contain" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                    <Tv className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{current.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{current.group}</p>
                </div>
                <Badge variant="destructive" className="text-[10px]">
                  <Signal className="me-1 h-3 w-3" /> {T.live}
                </Badge>
              </div>
            )}
          </Card>
        </div>

        {/* Playlist manager */}
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <ListVideo className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">{T.playlists}</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                  activeId === pl.id ? 'border-primary bg-primary/10' : 'border-border bg-muted/40'
                }`}
              >
                <button type="button" onClick={() => loadPlaylist(pl)} className="font-semibold">
                  {pl.name}
                  {pl.last_latency_ms != null && (
                    <span className={`ms-2 ${latencyTone(pl.last_latency_ms)}`}>{pl.last_latency_ms}ms</span>
                  )}
                  {pl.channel_count != null && (
                    <span className="ms-1 text-muted-foreground">· {pl.channel_count}</span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label="delete"
                  onClick={() => removePlaylist(pl.id)}
                  className="opacity-50 transition hover:text-destructive hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
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
        </Card>

        {/* Search + categories */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={T.search}
              className="h-10 ps-9"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveGroup('all')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                activeGroup === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
              }`}
            >
              {T.all} · {channels.length}
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGroup(g)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  activeGroup === g ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70'
                }`}
              >
                {g} · {groupCounts[g]}
              </button>
            ))}
          </div>
        </div>

        {/* Channels grid */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-xs font-semibold">{T.loadingChannels}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-xs font-semibold text-muted-foreground">{T.noChannels}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {filtered.slice(0, 300).map((ch, i) => (
              <button
                key={`${ch.url}-${i}`}
                type="button"
                onClick={() => playChannel(ch)}
                className={`group relative overflow-hidden rounded-2xl border p-3 text-start transition-all ${
                  current?.url === ch.url
                    ? 'border-primary bg-primary/10'
                    : 'border-border/60 bg-card hover:border-primary/50'
                }`}
              >
                <div className="mb-2 flex h-14 items-center justify-center">
                  {ch.logo ? (
                    <img src={ch.logo} alt={ch.name} loading="lazy" className="max-h-14 max-w-full object-contain" />
                  ) : (
                    <Tv className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <p className="truncate text-xs font-bold">{ch.name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{ch.group}</p>
                <span className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="h-4 w-4 text-primary" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
