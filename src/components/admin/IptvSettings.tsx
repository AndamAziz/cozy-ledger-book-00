import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Radio, Save, PlugZap, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const SETTING_KEY = 'iptv_playlist_url';

interface TestState {
  ok: boolean;
  message: string;
}

export function IptvSettings() {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTING_KEY)
      .maybeSingle();
    if (error) {
      toast({ title: 'Could not load settings', description: error.message, variant: 'destructive' });
    } else {
      setUrl(data?.value ?? '');
      setInitial(data?.value ?? '');
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const runTest = async (): Promise<boolean> => {
    const candidate = url.trim();
    if (!candidate) {
      setTest({ ok: false, message: 'Enter a playlist URL first' });
      return false;
    }
    setTesting(true);
    setTest(null);
    try {
      const { data, error } = await supabase.functions.invoke('iptv-test', {
        body: { url: candidate },
      });
      if (error) {
        // Surface the real reason the function returned instead of a generic message.
        let detail = error.message;
        const ctx = (error as { context?: Response }).context;
        try {
          const parsed = ctx ? await ctx.clone().json() : null;
          if (parsed?.error) detail = String(parsed.error);
        } catch {
          // keep error.message
        }
        setTest({ ok: false, message: detail });
        return false;
      }
      if (data?.ok) {
        setTest({
          ok: true,
          message: `Connected to ${data.host} · ${data.channels} channels · ${data.latency_ms}ms`,
        });
        return true;
      }
      setTest({
        ok: false,
        message: data?.error
          ? `${data.error}${data.status ? ` (HTTP ${data.status})` : ''}`
          : 'Connection failed',
      });
      return false;
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : 'Connection failed' });
      return false;
    } finally {
      setTesting(false);
    }
  };


  const save = async () => {
    const candidate = url.trim();
    if (!candidate) return;
    setSaving(true);
    try {
      // Never save a link that isn't returning channels.
      const healthy = await runTest();
      if (!healthy) {
        toast({
          title: 'Not saved',
          description: 'The link did not return channels. Fix it and try again.',
          variant: 'destructive',
        });
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key: SETTING_KEY, value: candidate, updated_by: userRes.user?.id ?? null },
          { onConflict: 'key' },
        );
      if (error) throw error;
      setInitial(candidate);
      toast({ title: 'Saved', description: 'The IPTV playlist link has been updated.' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty = url.trim() !== initial.trim();

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <header className="mb-4 flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-bold">IPTV Playlist Server</h3>
          <p className="text-xs text-muted-foreground">
            The M3U/Xtream link used by Live TV, Movies, Series and Replay.
          </p>
        </div>
      </header>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="iptv-url">M3U Playlist URL</Label>
          <Input
            id="iptv-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTest(null);
            }}
            placeholder="http://host/get.php?username=USER&password=PASS&type=m3u_plus  or  https://…/playlist.m3u8"
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
            maxLength={2048}
          />
        </div>

        {test && (
          <p
            className={`flex items-center gap-1.5 text-xs font-semibold ${
              test.ok ? 'text-success' : 'text-destructive'
            }`}
          >
            {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {test.message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void runTest()} disabled={testing || saving || loading}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
            Test Link
          </Button>
          <Button onClick={() => void save()} disabled={saving || testing || loading || !dirty}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Changes apply within about a minute. If left empty, the app falls back to the configured default link.
        </p>
      </div>
    </section>
  );
}
