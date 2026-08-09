import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  RefreshCw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
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
  /** Live verdict written by every automatic provider health check. */
  health_status?: 'online' | 'slot_limit' | 'offline' | null;
  health_message?: string | null;
  health_checked_at?: string | null;
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
  live?: number;
  vod?: number | null;
  series?: number | null;
  online?: number;
  sample_tested?: number;
  sample_online?: number;
  latency_ms?: number;
  host?: string;
  compatible?: boolean;
  message?: string;
  error?: string;
  at?: string;
}


interface DirectoryUser {
  userId: string;
  email: string;
  sources: IptvSource[];
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
  const rows: [string, string][] = [
    ['Connection', result.ok ? 'Online' : 'Failed'],
    ['Type', (result.kind ?? '—').toUpperCase()],
    ['Live channels', (result.live ?? result.channels) != null ? String(result.live ?? result.channels) : '—'],
  ];
  if (result.vod != null) rows.push(['Movies (VOD)', String(result.vod)]);
  if (result.series != null) rows.push(['Series', String(result.series)]);
  if (result.online != null) rows.push(['Online channels', String(result.online)]);
  if (result.sample_tested) {
    rows.push(['Playback sample', `${result.sample_online ?? 0}/${result.sample_tested} playing`]);
  }
  rows.push(
    ['Response time', result.latency_ms != null ? `${result.latency_ms} ms` : '—'],
    ['Stream compatibility', result.ok ? (result.compatible ? 'Playable' : 'Unknown') : '—'],
  );

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
  canManage = true,
}: {
  /** Admin only: manage another account's sources. */
  userId?: string;
  onChanged?: () => void;
  compact?: boolean;
  /** CEO only: add / edit / delete links. Others can just switch source. */
  canManage?: boolean;
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
  // Per-row provider health probe (moved here from the Live TV page).
  const [healthBusy, setHealthBusy] = useState<string | null>(null);
  const [rowHealth, setRowHealth] = useState<
    Record<string, { status?: string; message?: string; latencyMs?: number; activeConnections?: number; maxConnections?: number }>
  >({});
  // CEO: assign one of my sources to another account.
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignQuery, setAssignQuery] = useState('');
  const [assignResults, setAssignResults] = useState<{ id: string; email: string }[]>([]);
  const [assignPicked, setAssignPicked] = useState<{ id: string; email: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [assignedNote, setAssignedNote] = useState<{ sourceId: string; email: string } | null>(null);
  const [assignedUsers, setAssignedUsers] = useState<
    { id: string; email: string; isActive: boolean }[]
  >([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  // CEO directory: every account holding a provider link.
  const [dirOpen, setDirOpen] = useState(false);
  const [dirLoading, setDirLoading] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [dirEditing, setDirEditing] = useState<string | null>(null);
  const [dirName, setDirName] = useState('');
  const [dirUrl, setDirUrl] = useState('');


  const loadAssigned = useCallback(async (sourceId: string) => {
    setLoadingAssigned(true);
    try {
      const data = await call({ action: 'assigned_users', id: sourceId });
      setAssignedUsers((data?.users ?? []) as { id: string; email: string; isActive: boolean }[]);
    } catch {
      setAssignedUsers([]);
    } finally {
      setLoadingAssigned(false);
    }
  }, []);

  const searchUsers = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setAssignResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await call({ action: 'search_users', query });
      setAssignResults((data?.users ?? []) as { id: string; email: string }[]);
    } catch {
      setAssignResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const assignSource = async (s: IptvSource) => {
    if (!assignPicked) return;
    setBusy(`assign-${s.id}`);
    try {
      const data = await call({ action: 'assign_source', id: s.id, targetUserId: assignPicked.id });
      const email = (data?.email as string) || assignPicked.email;
      setAssignedNote({ sourceId: s.id, email });
      toast.success(`“${s.name}” assigned to ${email} and set as their active server`);
      await loadAssigned(s.id);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not assign that source');
    } finally {
      setBusy(null);
    }
  };

  const unassignSource = async (s: IptvSource, target: { id: string; email: string }) => {
    setBusy(`unassign-${target.id}`);
    try {
      await call({ action: 'unassign_source', id: s.id, targetUserId: target.id });
      toast.success(`“${s.name}” revoked from ${target.email}`);
      setAssignedNote(null);
      await loadAssigned(s.id);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke that source');
    } finally {
      setBusy(null);
    }
  };




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

  /** CEO directory of every account holding a provider link. */
  const loadDirectory = useCallback(async () => {
    setDirLoading(true);
    try {
      const data = await call({ action: 'assigned_directory' });
      setDirectory((data?.users ?? []) as DirectoryUser[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load assigned users');
      setDirectory([]);
    } finally {
      setDirLoading(false);
    }
  }, []);

  const saveUserSource = async (targetUserId: string, s: IptvSource) => {
    const trimmed = dirUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      toast.error('Enter a full http(s) playlist or Xtream URL');
      return;
    }
    setBusy(`dir-save-${s.id}`);
    try {
      await call({
        action: 'save_source',
        userId: targetUserId,
        id: s.id,
        name: dirName.trim() || s.name,
        playlistUrl: trimmed,
      });
      toast.success('Server updated for that user');
      setDirEditing(null);
      setDirName('');
      setDirUrl('');
      await loadDirectory();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update that server');
    } finally {
      setBusy(null);
    }
  };

  const deleteUserSource = async (targetUserId: string, s: IptvSource, email: string) => {
    setBusy(`dir-del-${s.id}`);
    try {
      await call({ action: 'delete_source', userId: targetUserId, id: s.id });
      toast.success(`“${s.name}” deleted from ${email}`);
      await loadDirectory();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete that server');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`w-full space-y-3 text-left ${compact ? '' : 'max-w-md'}`}>
      {canManage && !userId && (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !dirOpen;
                setDirOpen(next);
                if (next && directory.length === 0) void loadDirectory();
              }}
              className="flex flex-1 items-center gap-2 text-[11px] font-extrabold uppercase tracking-wide"
            >
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              Users with a server
              {directory.length > 0 && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[9px] text-emerald-300">
                  {directory.length}
                </span>
              )}
              <ChevronDown
                className={`ms-auto h-3.5 w-3.5 transition ${dirOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {dirOpen && (
              <button
                type="button"
                onClick={() => void loadDirectory()}
                disabled={dirLoading}
                className="rounded-full border border-white/10 p-1.5 opacity-70 transition hover:opacity-100 disabled:opacity-40"
                aria-label="Refresh list"
              >
                <RefreshCw className={`h-3 w-3 ${dirLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {dirOpen && (
            <div className="space-y-2">
              {dirLoading ? (
                <p className="flex items-center gap-1 text-[10px] opacity-60">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </p>
              ) : directory.length === 0 ? (
                <p className="text-[10px] opacity-50">
                  No user has a provider link yet — assign one from a source below.
                </p>
              ) : (
                directory.map((u) => (
                  <div
                    key={u.userId}
                    className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
                  >
                    <p dir="ltr" className="truncate text-[11px] font-extrabold text-emerald-200">
                      {u.email || u.userId}
                    </p>
                    {u.sources.map((s) => (
                      <div key={s.id} className="space-y-1 rounded-lg border border-white/10 p-2">
                        <div className="flex items-center gap-2">
                          <RadioTower className="h-3 w-3 shrink-0 text-[#ff2d6f]" />
                          <span className="truncate text-[11px] font-bold">{s.name}</span>
                          {s.is_active && (
                            <span className="ms-auto shrink-0 text-[9px] font-extrabold text-emerald-400">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p dir="ltr" className="truncate text-[9px] opacity-50">
                          {s.playlist_masked}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const next = dirEditing === s.id ? null : s.id;
                              setDirEditing(next);
                              setDirName(next ? s.name : '');
                              setDirUrl('');
                            }}
                            className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold opacity-80 transition hover:opacity-100"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteUserSource(u.userId, s, u.email)}
                            disabled={busy === `dir-del-${s.id}`}
                            className="flex items-center gap-1 rounded-full border border-rose-500/30 px-2.5 py-1 text-[10px] font-bold text-rose-400 transition hover:border-rose-500/60 disabled:opacity-40"
                          >
                            {busy === `dir-del-${s.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                            Delete
                          </button>
                        </div>
                        {dirEditing === s.id && (
                          <div className="space-y-1.5 pt-1">
                            <input
                              value={dirName}
                              onChange={(e) => setDirName(e.target.value)}
                              placeholder="Server name"
                              className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[11px] outline-none focus:border-emerald-400/60"
                            />
                            <input
                              value={dirUrl}
                              onChange={(e) => setDirUrl(e.target.value)}
                              dir="ltr"
                              placeholder="New link (leave empty to keep current)"
                              className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.05] px-2 text-[11px] outline-none focus:border-emerald-400/60"
                            />
                            <button
                              type="button"
                              onClick={() => void saveUserSource(u.userId, s)}
                              disabled={busy === `dir-save-${s.id}`}
                              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-1.5 text-[11px] font-extrabold text-black transition disabled:opacity-40"
                            >
                              {busy === `dir-save-${s.id}` && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              )}
                              Save changes
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

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
              {s.health_status && (
                <p
                  className={`text-[10px] font-extrabold ${
                    s.health_status === 'online'
                      ? 'text-emerald-400'
                      : s.health_status === 'slot_limit'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  {s.health_status === 'online' ? '● ONLINE' : s.health_status === 'slot_limit' ? '● BUSY' : '● OFFLINE'}
                  {s.health_message ? ` · ${s.health_message}` : ''}
                  {s.health_checked_at
                    ? ` · ${new Date(s.health_checked_at).toLocaleTimeString()}`
                    : ''}
                </p>
              )}
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
                    rowTest[s.id].ok
                      ? 'text-emerald-400'
                      : rowTest[s.id].errorKind === 'empty_catalogue'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  {rowTest[s.id].ok
                    ? `Stream OK · ${rowTest[s.id].latency_ms ?? '—'} ms`
                    : rowTest[s.id].errorKind === 'empty_catalogue'
                      ? `Reachable · ${rowTest[s.id].message ?? 'empty category'}`
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
                {canManage && (
                  <>
                    {!userId && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = assignFor === s.id ? null : s.id;
                          setAssignFor(next);
                          setAssignQuery('');
                          setAssignResults([]);
                          setAssignPicked(null);
                          setAssignedNote(null);
                          setAssignedUsers([]);
                          if (next) void loadAssigned(s.id);
                        }}
                        className="flex items-center gap-1 rounded-full border border-emerald-500/30 px-3 py-1 text-[10px] font-bold text-emerald-300 transition hover:border-emerald-400/70"
                      >
                        <UserPlus className="h-3 w-3" /> Assign to user
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
                  </>
                )}
              </div>
              {canManage && !userId && assignFor === s.id && (
                <div className="mt-2 space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-300">
                    Assign “{s.name}” to a user
                  </p>
                  <input
                    value={assignQuery}
                    onChange={(e) => {
                      setAssignQuery(e.target.value);
                      setAssignPicked(null);
                      void searchUsers(e.target.value);
                    }}
                    dir="ltr"
                    placeholder="Search by email…"
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs outline-none focus:border-emerald-400/60"
                  />
                  {searching && (
                    <p className="flex items-center gap-1 text-[10px] opacity-60">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </p>
                  )}
                  {!searching && assignQuery.trim().length >= 2 && assignResults.length === 0 && (
                    <p className="text-[10px] opacity-50">No account matches that email.</p>
                  )}
                  {assignResults.length > 0 && (
                    <div className="max-h-40 space-y-1 overflow-y-auto">
                      {assignResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setAssignPicked(u)}
                          dir="ltr"
                          className={`block w-full truncate rounded-lg border px-2.5 py-1.5 text-start text-[11px] font-bold transition ${
                            assignPicked?.id === u.id
                              ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
                              : 'border-white/10 bg-white/[0.04] opacity-80 hover:opacity-100'
                          }`}
                        >
                          {u.email}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => void assignSource(s)}
                    disabled={!assignPicked || busy === `assign-${s.id}`}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 text-[11px] font-extrabold text-black transition disabled:opacity-40"
                  >
                    {busy === `assign-${s.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    {assignPicked ? `Assign to ${assignPicked.email}` : 'Pick a user first'}
                  </button>
                  {assignedNote && assignedNote.sourceId === s.id && (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-extrabold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Assigned & activated for{' '}
                      <span dir="ltr">{assignedNote.email}</span>
                    </p>
                  )}

                  <div className="space-y-1.5 border-t border-white/10 pt-2">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide opacity-60">
                      Assigned users
                    </p>
                    {loadingAssigned ? (
                      <p className="flex items-center gap-1 text-[10px] opacity-60">
                        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                      </p>
                    ) : assignedUsers.length === 0 ? (
                      <p className="text-[10px] opacity-50">Not assigned to anyone yet.</p>
                    ) : (
                      assignedUsers.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5"
                        >
                          <span dir="ltr" className="truncate text-[11px] font-bold">
                            {u.email}
                          </span>
                          {u.isActive && (
                            <span className="text-[9px] font-extrabold text-emerald-400">ACTIVE</span>
                          )}
                          <button
                            type="button"
                            onClick={() => void unassignSource(s, u)}
                            disabled={busy === `unassign-${u.id}`}
                            className="ms-auto flex shrink-0 items-center gap-1 rounded-full border border-rose-500/30 px-2.5 py-1 text-[10px] font-bold text-rose-400 transition hover:border-rose-500/60 disabled:opacity-40"
                          >
                            {busy === `unassign-${u.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <UserMinus className="h-3 w-3" />
                            )}
                            Revoke
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              )}
            </div>

          ))}
          {sources.length === 0 && (
            <p className="text-[11px] opacity-50">
              {canManage
                ? 'No sources yet — add your first playlist below.'
                : 'No provider link assigned to your account yet — the admin will add one for you.'}
            </p>
          )}
        </div>
      )}

      {canManage && (
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
        <div className="space-y-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[10px] leading-relaxed opacity-70">
          <p className="font-extrabold opacity-100">Supported link types for testing</p>
          <p>
            <span className="font-bold">Xtream API</span> — player_api.php / get.php with
            username &amp; password (live + movies + series counts)
          </p>
          <p>
            <span className="font-bold">M3U / M3U_PLUS</span> — .m3u playlist files (channel list)
          </p>
          <p>
            <span className="font-bold">HLS</span> — .m3u8 manifest (single stream)
          </p>
          <p>
            <span className="font-bold">MPEG-TS</span> — .ts live feed (single stream)
          </p>
          <p>
            <span className="font-bold">Progressive files</span> — .mp4, .mkv, .m4v, .mov, .avi,
            .webm, .flv (single stream)
          </p>
          <p>
            <span className="font-bold">MPEG-DASH</span> — .mpd manifest (single stream)
          </p>
          <p className="opacity-60">
            Xtream direct paths like /live/user/pass/123 are detected as one stream too.
          </p>
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
      )}
      {canManage && (
        <p className="text-[10px] leading-relaxed opacity-40">
          Each source keeps its own channels and credentials — nothing is mixed. Links are encrypted
          before storage and never shown in full again.
        </p>
      )}
    </div>
  );
}
