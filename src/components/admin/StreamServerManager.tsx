import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tv,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Power,
  RefreshCw,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react';

type TestStatus = 'live' | 'slow' | 'offline';
interface TestResult {
  status: TestStatus;
  latency_ms: number | null;
}

interface StreamServerRow {
  id: string;
  name: string;
  url: string;
  priority: number;
  is_active: boolean;
  last_status: string | null;
  last_latency_ms: number | null;
  auto_disabled: boolean;
}

interface StreamServerManagerProps {
  isCEO: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  live: 'text-success',
  slow: 'text-warning',
  offline: 'text-destructive',
  checking: 'text-muted-foreground',
};

export function StreamServerManager({ isCEO }: StreamServerManagerProps) {
  const { toast } = useToast();
  const [servers, setServers] = useState<StreamServerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StreamServerRow | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchServers = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('stream_servers')
        .select('*')
        .order('priority', { ascending: true });
      if (error) throw error;
      setServers((data ?? []) as StreamServerRow[]);
    } catch (err) {
      console.error('Failed to load stream servers:', err);
      toast({ title: 'Failed to load servers', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isCEO) fetchServers();
  }, [isCEO, fetchServers]);

  if (!isCEO) return null;

  const openAdd = () => {
    setEditing(null);
    setName('');
    setUrl('');
    setDialogOpen(true);
  };

  const openEdit = (s: StreamServerRow) => {
    setEditing(s);
    setName(s.name);
    setUrl(s.url);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      toast({ title: 'Name and URL are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('stream_servers')
          .update({ name: name.trim(), url: url.trim() })
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Server updated' });
      } else {
        const nextPriority = servers.length
          ? Math.max(...servers.map((s) => s.priority)) + 1
          : 1;
        const { error } = await supabase.from('stream_servers').insert({
          name: name.trim(),
          url: url.trim(),
          priority: nextPriority,
          is_active: true,
        });
        if (error) throw error;
        toast({ title: 'Server added' });
      }
      setDialogOpen(false);
      fetchServers();
    } catch (err) {
      console.error('Save failed:', err);
      toast({ title: 'Save failed', description: String((err as Error)?.message), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: StreamServerRow) => {
    if (!confirm(`Delete "${s.name}"?`)) return;
    try {
      const { error } = await supabase.from('stream_servers').delete().eq('id', s.id);
      if (error) throw error;
      toast({ title: 'Server removed' });
      fetchServers();
    } catch (err) {
      toast({ title: 'Delete failed', description: String((err as Error)?.message), variant: 'destructive' });
    }
  };

  const toggleActive = async (s: StreamServerRow) => {
    try {
      const { error } = await supabase
        .from('stream_servers')
        .update({
          is_active: !s.is_active,
          // Re-enabling clears the auto-disabled flag and fail counter.
          auto_disabled: s.is_active ? s.auto_disabled : false,
          fail_count: s.is_active ? undefined : 0,
        })
        .eq('id', s.id);
      if (error) throw error;
      toast({ title: s.is_active ? 'Server disabled' : 'Server re-enabled' });
      fetchServers();
    } catch (err) {
      toast({ title: 'Update failed', description: String((err as Error)?.message), variant: 'destructive' });
    }
  };

  const reorder = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= servers.length) return;
    const a = servers[index];
    const b = servers[target];
    try {
      const { error: e1 } = await supabase
        .from('stream_servers')
        .update({ priority: b.priority })
        .eq('id', a.id);
      const { error: e2 } = await supabase
        .from('stream_servers')
        .update({ priority: a.priority })
        .eq('id', b.id);
      if (e1 || e2) throw e1 || e2;
      fetchServers();
    } catch (err) {
      toast({ title: 'Reorder failed', variant: 'destructive' });
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-success/25 bg-gradient-to-br from-success/10 to-transparent p-4">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-success to-success/80 flex items-center justify-center shadow-[0_0_14px_hsl(var(--success)/0.4)]">
            <Tv className="h-4 w-4 text-success-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Sport Live Servers</h2>
            <p className="text-[11px] text-muted-foreground">Manage streams &amp; failover order</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={fetchServers} className="h-9 rounded-lg">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openAdd} className="h-9 rounded-lg gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        {servers.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground py-2">No servers yet. Add one to get started.</p>
        )}
        {servers.map((s, i) => {
          const status = s.last_status ?? 'checking';
          return (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-secondary/30 px-3 py-2.5"
            >
              <div className="flex flex-col">
                <button
                  onClick={() => reorder(i, -1)}
                  disabled={i === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => reorder(i, 1)}
                  disabled={i === servers.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">{s.name}</span>
                  <span className={`text-[10px] font-bold ${STATUS_STYLE[status] ?? 'text-muted-foreground'}`}>
                    {status}
                  </span>
                  {s.auto_disabled && (
                    <span className="text-[10px] font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
                      auto-disabled — unreachable
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{s.url}</p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleActive(s)}
                  className={`h-8 w-8 rounded-lg ${s.is_active ? 'text-success' : 'text-muted-foreground'}`}
                  title={s.is_active ? 'Disable' : 'Re-enable'}
                >
                  {s.is_active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)} className="h-8 w-8 rounded-lg">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(s)}
                  className="h-8 w-8 rounded-lg text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit server' : 'Add server'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="srv-name">Name</Label>
              <Input id="srv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Server 1" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="srv-url">Stream URL</Label>
              <Input id="srv-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
              {editing ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
