import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Radio, Save, Search, Timer, Unlock, Lock } from 'lucide-react';

interface Row {
  userId: string;
  email: string;
  playlistUrl: string;
  trialEndsAt: string | null;
  isActivated: boolean;
}

function trialLabel(row: Row): { text: string; tone: string } {
  if (row.isActivated) return { text: 'Activated (paid)', tone: 'text-emerald-500' };
  if (!row.trialEndsAt) return { text: 'No trial', tone: 'text-muted-foreground' };
  const ms = new Date(row.trialEndsAt).getTime() - Date.now();
  if (ms <= 0) return { text: 'Trial expired', tone: 'text-destructive' };
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { text: `Trial: ${h}h ${m}m left`, tone: 'text-amber-500' };
}

/**
 * Per-user Live TV administration: personal provider link, trial timer and
 * paid activation status. Each account streams from its own credentials.
 */
export function LiveTvUsersAdmin() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [users, access, servers] = await Promise.all([
      supabase.from('user_approvals').select('user_id, email').order('email'),
      supabase.from('livetv_access').select('user_id, trial_ends_at, is_activated'),
      supabase.from('user_iptv_servers').select('user_id, playlist_url'),
    ]);
    const accessMap = new Map((access.data ?? []).map((a) => [a.user_id, a]));
    const serverMap = new Map((servers.data ?? []).map((s) => [s.user_id, s]));
    setRows(
      (users.data ?? []).map((u) => ({
        userId: u.user_id,
        email: u.email,
        playlistUrl: serverMap.get(u.user_id)?.playlist_url ?? '',
        trialEndsAt: accessMap.get(u.user_id)?.trial_ends_at ?? null,
        isActivated: !!accessMap.get(u.user_id)?.is_activated,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.email.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const saveServer = async (row: Row) => {
    const url = (drafts[row.userId] ?? row.playlistUrl).trim();
    setBusy(row.userId);
    const { error } = await supabase
      .from('user_iptv_servers')
      .upsert({ user_id: row.userId, playlist_url: url }, { onConflict: 'user_id' });
    setBusy(null);
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else {
      toast({ title: 'IPTV server updated', description: row.email });
      void load();
    }
  };

  const setActivation = async (row: Row, activated: boolean) => {
    setBusy(row.userId);
    const { error } = await supabase.from('livetv_access').upsert(
      {
        user_id: row.userId,
        is_activated: activated,
        activated_at: activated ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    setBusy(null);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else void load();
  };

  const extendTrial = async (row: Row, hours: number) => {
    setBusy(row.userId);
    const base = row.trialEndsAt && new Date(row.trialEndsAt).getTime() > Date.now()
      ? new Date(row.trialEndsAt).getTime()
      : Date.now();
    const { error } = await supabase.from('livetv_access').upsert(
      {
        user_id: row.userId,
        trial_ends_at: new Date(base + hours * 3_600_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
    setBusy(null);
    if (error) toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    else void load();
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Radio className="h-5 w-5 text-primary" />
        <h3 className="text-sm font-bold">Live TV — per-user servers &amp; access</h3>
        <div className="relative ms-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email…"
            className="pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const label = trialLabel(row);
            return (
              <div key={row.userId} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{row.email}</span>
                  <span className={`text-xs font-bold ${label.tone}`}>{label.text}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Input
                    dir="ltr"
                    value={drafts[row.userId] ?? row.playlistUrl}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.userId]: e.target.value }))}
                    placeholder="http://provider/get.php?username=…&password=…"
                    className="min-w-[240px] flex-1"
                  />
                  <Button size="sm" onClick={() => saveServer(row)} disabled={busy === row.userId}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => extendTrial(row, 24)} disabled={busy === row.userId}>
                    <Timer className="mr-1 h-3.5 w-3.5" /> +24h trial
                  </Button>
                  {row.isActivated ? (
                    <Button size="sm" variant="outline" onClick={() => setActivation(row, false)} disabled={busy === row.userId}>
                      <Lock className="mr-1 h-3.5 w-3.5" /> Deactivate
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setActivation(row, true)} disabled={busy === row.userId}>
                      <Unlock className="mr-1 h-3.5 w-3.5" /> Activate (paid)
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-xs text-muted-foreground">No users match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}
