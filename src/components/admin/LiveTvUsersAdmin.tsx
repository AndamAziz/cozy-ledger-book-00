import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ListTree, Loader2, Radio, Save, Search, Timer, Unlock, Lock } from 'lucide-react';
import { IptvSourceManager } from '@/components/livetv/IptvSourceManager';

interface AssignedSource {
  id: string;
  name: string;
  kind: string;
  isActive: boolean;
  isSelected: boolean;
}

interface Row {
  userId: string;
  email: string;
  hasServer: boolean;
  masked: string;
  trialEndsAt: string | null;
  isActivated: boolean;
  sources: AssignedSource[];
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
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [users, access, servers, assigned] = await Promise.all([
      supabase.from('user_approvals').select('user_id, email').order('email'),
      supabase.from('livetv_access').select('user_id, trial_ends_at, is_activated'),
      supabase.functions.invoke('iptv-server', { body: { action: 'admin_list' } }),
      // Read-only: names/types of the sources each account holds. No URLs.
      supabase.functions.invoke('iptv-server', { body: { action: 'admin_assigned_sources' } }),
    ]);
    const accessMap = new Map((access.data ?? []).map((a) => [a.user_id, a]));
    // Credentials are encrypted at rest; the vault function returns masked previews only.
    const serverRows = (servers.data?.rows ?? []) as {
      userId: string;
      hasServer: boolean;
      masked: string;
    }[];
    const serverMap = new Map(serverRows.map((s) => [s.userId, s]));
    const byUser = (assigned.data?.byUser ?? {}) as Record<string, AssignedSource[]>;
    setRows(
      (users.data ?? []).map((u) => ({
        userId: u.user_id,
        email: u.email,
        hasServer: !!serverMap.get(u.user_id)?.hasServer,
        masked: serverMap.get(u.user_id)?.masked ?? '',
        trialEndsAt: accessMap.get(u.user_id)?.trial_ends_at ?? null,
        isActivated: !!accessMap.get(u.user_id)?.is_activated,
        sources: byUser[u.user_id] ?? [],
      })),
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: owner } = await supabase.rpc('has_role', {
        _user_id: data.user.id,
        _role: 'owner',
      });
      setIsOwner(!!owner);
    });
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.email.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const saveServer = async (row: Row) => {
    const url = (drafts[row.userId] ?? '').trim();
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: 'Enter a full http(s) URL', variant: 'destructive' });
      return;
    }
    setBusy(row.userId);
    const { data, error } = await supabase.functions.invoke('iptv-server', {
      body: { action: 'admin_save', userId: row.userId, playlistUrl: url },
    });
    setBusy(null);
    if (error || data?.error) {
      toast({ title: 'Save failed', description: data?.error ?? error?.message, variant: 'destructive' });
    } else {
      setDrafts((d) => ({ ...d, [row.userId]: '' }));
      toast({ title: 'IPTV server updated (encrypted)', description: row.email });
      void load();
    }
  };

  const setActivation = async (row: Row, activated: boolean) => {
    setBusy(row.userId);
    const { data, error } = await supabase.functions.invoke('iptv-server', {
      body: { action: 'set_access', userId: row.userId, activated },
    });
    setBusy(null);
    if (error || data?.error) toast({ title: 'Update failed', description: data?.error ?? error?.message, variant: 'destructive' });
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
                {isOwner && <div className="flex flex-wrap gap-2">
                  <Input
                    dir="ltr"
                    value={drafts[row.userId] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.userId]: e.target.value }))}
                    placeholder={row.hasServer ? `Saved: ${row.masked} — paste a new link to replace` : 'http://provider/get.php?username=…&password=…'}
                    className="min-w-[240px] flex-1"
                  />
                  <Button size="sm" onClick={() => saveServer(row)} disabled={busy === row.userId}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenSources((s) => (s === row.userId ? null : row.userId))}
                  >
                    <ListTree className="mr-1 h-3.5 w-3.5" />
                    {openSources === row.userId ? 'Hide sources' : 'Sources'}
                  </Button>
                </div>}
                {isOwner && openSources === row.userId && (
                  <div className="rounded-lg border bg-background/40 p-3">
                    <IptvSourceManager userId={row.userId} compact onChanged={() => void load()} />
                  </div>
                )}

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
