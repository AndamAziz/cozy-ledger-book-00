import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  Trash2,
  Wifi,
  XCircle,
  Zap,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Multi-source IPTV manager.
 *
 * Every source is an independent playlist (its own credentials, channels and
 * categories) — switching only changes which one is active, nothing is merged.
 * Credentials go through the `iptv-server` vault, so the browser only ever
 * sees a masked preview.
 */

export interface IptvSource {
  id: string;
  name: string;
  kind: 'm3u' | 'xtream' | string;
  playlist_masked: string;
  is_active: boolean;
  last_test: TestResult | null;
  updated_at: string;
}

interface RowTestResult {
  ok: boolean;
  latency_ms?: number;
  status?: number;
  errorKind?: string;
  message?: string;
  error?: string;
  reqId?: string;
}

interface TestResult {
  ok: boolean;
  kind?: string;
  channels?: number;
  latency_ms?: number;
  host?: string;
  compatible?: boolean;
  message?: string;
  error?: string;
  at?: string;
}

/** Ready-made sources for one-tap setup. */
const PRESETS = [
  { label: 'Source A — Iraq (public M3U)', url: 'https://iptv-org.github.io/iptv/countries/iq.m3u' },
  {
    label: 'Source B — MyRestreamer (Xtream)',
    url: 'http://myrestreamer.com:8080/player_api.php?username=162360837276&password=6a69c61558b80',
  },
  { label: 'Kurdish', url: 'https://iptv-org.github.io/iptv/languages/kur.m3u' },
  { label: 'UK', url: 'https://iptv-org.github.io/iptv/countries/uk.m3u' },
  { label: 'Sports', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
];

const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('iptv-server', { body });
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'Request failed');
  return data;
};

function Diagnostics({ result }: { result: TestResult }) {
  const rows = [
    ['Connection', result.ok ? 'Online' : 'Failed'],
    ['Type', (result.kind ?? '—').toUpperCase()],
    ['Channels', result.channels != null ? String(result.channels) : '—'],
    ['Response time', result.latency_ms != null ? `${result.latency_ms} ms` : '—'],
    ['Stream compatibility', result.ok ? (result.compatible ? 'Playable' : 'Unknown') : '—'],
  ];
  return (
    <div
      className={`space-y-1 rounded-xl border p-3 text-[11px] ${
        result.ok ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10'
      }`}
    >
      <p className="flex items-center gap-1.5 font-extrabold">
        {result.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-rose-400" />
        )}
        {result.message ?? result.error ?? (result.ok ? 'Reachable' : 'Not reachable')}
      </p>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 opacity-80">
          <span>{k}</span>
          <span dir="ltr" className="font-bold">
            {v}
          </span>
        </div>
      ))}
      {result.host && (
        <div className="flex justify-between gap-3 opacity-60">
          <span>Host</span>
          <span dir="ltr">{result.host}</span>
        </div>
      )}
    </div>
  );
}

export function IptvSourceManager({
  userId,
  onChanged,
  compact = false,
}: {
  /** Admin only: manage another account's sources. */
  userId?: string;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [sources, setSources] = useState<IptvSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  // Per-row stream-resolver probe (does not block the row UI).
  const [rowTesting, setRowTesting] = useState<string | null>(null);
  const [rowTest, setRowTest] = useState<Record<string, RowTestResult>>({});

  const testStream = async (s: IptvSource) => {
    setRowTesting(s.id);
    try {
      const { data, error } = await supabase.functions.invoke('iptv-stream-test', {
        body: { sourceId: s.id, userId },
      });
      if (error) throw error;
      setRowTest((prev) => ({ ...prev, [s.id]: data as RowTestResult }));
    } catch (e) {
      setRowTest((prev) => ({
        ...prev,
        [s.id]: { ok: false, errorKind: 'unknown', message: e instanceof Error ? e.message : 'Test failed' },
      }));
    } finally {
      setRowTesting(null);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await call({ action: 'list_sources', userId });
      setSources((data?.sources ?? []) as IptvSource[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load sources');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setUrl('');
    setTest(null);
  };

  const runTest = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('Enter a full http(s) playlist or Xtream URL');
      return null;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('iptv-test', {
        body: { url: trimmed },
      });
      if (error) throw error;
      const result: TestResult = { ...(data as TestResult), at: new Date().toISOString() };
      setTest(result);
      if (result.ok) toast.success(result.message ?? 'Link is working');
      else toast.error(result.error ?? 'That link did not respond');
      return result;
    } catch (e) {
      const result: TestResult = { ok: false, error: e instanceof Error ? e.message : 'Test failed' };
      setTest(result);
      toast.error(result.error!);
      return result;
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const trimmed = url.trim();
    if (!editingId && !/^https?:\/\//i.test(trimmed)) {
      toast.error('Enter a full http(s) playlist or Xtream URL');
      return;
    }
    setBusy('save');
    try {
      await call({
        action: 'save_source',
        userId,
        id: editingId,
        name: name.trim() || 'My source',
        playlistUrl: trimmed,
        lastTest: test,
      });
      toast.success(editingId ? 'Source updated' : 'Source added (encrypted)');
      resetForm();
      await load();
      qc.invalidateQueries({ queryKey: ['iptv-index'] });
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const activate = async (s: IptvSource) => {
    setBusy(s.id);
    try {
      await call({ action: 'activate_source', userId, id: s.id });
      await load();
      // Each source has its own catalogue — drop every cached list.
      qc.removeQueries({ queryKey: ['iptv-index'] });
      qc.removeQueries({ queryKey: ['iptv-channels'] });
      qc.removeQueries({ queryKey: ['iptv-search'] });
      qc.removeQueries({ queryKey: ['iptv-health'] });
      toast.success(`Now streaming from “${s.name}”`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch source');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (s: IptvSource) => {
    setBusy(s.id);
    try {
      await call({ action: 'delete_source', userId, id: s.id });
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`w-full space-y-3 text-left ${compact ? '' : 'max-w-md'}`}>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[#ff2d6f]" />
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((s) => (
            <div
              key={s.id}
              className={`space-y-1.5 rounded-xl border p-3 ${
                s.is_active ? 'border-[#ff2d6f]/50 bg-[#ff2d6f]/10' : 'border-white/10 bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center gap-2">
                <RadioTower className="h-3.5 w-3.5 text-[#ff2d6f]" />
                <span className="truncate text-xs font-extrabold">{s.name}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase opacity-70">
                  {s.kind}
                </span>
                {s.is_active && (
                  <span className="ms-auto text-[10px] font-extrabold text-emerald-400">ACTIVE</span>
                )}
              </div>
              <p dir="ltr" className="truncate text-[10px] opacity-50">
                {s.playlist_masked}
              </p>
              {s.last_test && (
                <p className="text-[10px] font-bold opacity-70">
                  Last test: {s.last_test.ok ? '✅' : '❌'}{' '}
                  {s.last_test.channels != null ? `${s.last_test.channels} ch · ` : ''}
                  {s.last_test.latency_ms != null ? `${s.last_test.latency_ms} ms` : ''}
                </p>
              )}
              {rowTest[s.id] && (
                <p
                  dir="ltr"
                  className={`text-[10px] font-bold ${
                    rowTest[s.id].ok ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {rowTest[s.id].ok
                    ? `Stream OK · ${rowTest[s.id].latency_ms ?? '—'} ms`
                    : `${rowTest[s.id].errorKind ?? 'error'}${
                        rowTest[s.id].status ? ` · ${rowTest[s.id].status}` : ''
                      }${rowTest[s.id].message ? ` — ${rowTest[s.id].message}` : ''}`}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => void testStream(s)}
                  disabled={rowTesting === s.id}
                  className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold opacity-80 transition hover:border-emerald-400/50 hover:opacity-100 disabled:opacity-40"
                >
                  {rowTesting === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wifi className="h-3 w-3" />
                  )}
                  Test
                </button>
                {!s.is_active && (
                  <button
                    type="button"
                    onClick={() => void activate(s)}
                    disabled={busy === s.id}
                    className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold opacity-80 transition hover:border-[#ff2d6f]/50 hover:opacity-100 disabled:opacity-40"
                  >
                    <Zap className="h-3 w-3" /> Use this
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(s.id);
                    setName(s.name);
                    setUrl('');
                    setTest(null);
                  }}
                  className="flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-[10px] font-bold opacity-80 transition hover:opacity-100"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void remove(s)}
                  disabled={busy === s.id}
                  className="flex items-center gap-1 rounded-full border border-rose-500/30 px-3 py-1 text-[10px] font-bold text-rose-400 transition hover:border-rose-500/60 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-[11px] opacity-50">No sources yet — add your first playlist below.</p>
          )}
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide opacity-60">
          <Plus className="h-3.5 w-3.5" /> {editingId ? 'Edit source' : 'Add a source'}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Source name (e.g. Source A — Iraq)"
          className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs outline-none focus:border-[#ff2d6f]/60"
        />
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setTest(null);
          }}
          dir="ltr"
          placeholder={
            editingId
              ? 'Paste a new link to replace (leave empty to keep the current one)'
              : 'http://provider.tv/player_api.php?username=…&password=… or .m3u'
          }
          className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs outline-none focus:border-[#ff2d6f]/60"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing || !url.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 py-2 text-[11px] font-bold opacity-85 transition hover:opacity-100 disabled:opacity-40"
          >
            {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test link
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy === 'save' || (!editingId && !url.trim())}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-extrabold text-white transition disabled:opacity-40"
            style={{ background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
          >
            {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editingId ? 'Save changes' : 'Add source'}
          </button>
        </div>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="text-[10px] font-bold underline underline-offset-4 opacity-50"
          >
            Cancel edit
          </button>
        )}
        {test && <Diagnostics result={test} />}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESETS.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => {
                setUrl(p.url);
                setName((n) => n || p.label);
                setTest(null);
              }}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold opacity-70 transition hover:border-[#ff2d6f]/50 hover:opacity-100"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[10px] leading-relaxed opacity-40">
        Each source keeps its own channels and credentials — nothing is mixed. Links are encrypted
        before storage and never shown in full again.
      </p>
    </div>
  );
}
