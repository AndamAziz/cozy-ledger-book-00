import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface PriceAlertRow {
  id: string;
  symbol: string;
  condition: 'above' | 'below';
  target_price: number;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
}

const SYMBOLS = ['XAUUSD', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function PushPriceAlerts() {
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [subscribing, setSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [alerts, setAlerts] = useState<PriceAlertRow[]>([]);

  const [symbol, setSymbol] = useState('XAUUSD');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [target, setTarget] = useState('');

  const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('price_alerts')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setAlerts(data as PriceAlertRow[]);
  }, [userId]);

  useEffect(() => { void loadAlerts(); }, [loadAlerts]);

  // Check if a subscription already exists on this device for this user.
  useEffect(() => {
    (async () => {
      if (!userId || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const existing = await reg?.pushManager.getSubscription();
        if (existing) {
          const { data } = await supabase
            .from('push_subscriptions')
            .select('id')
            .eq('endpoint', existing.endpoint)
            .maybeSingle();
          setIsSubscribed(!!data);
        }
      } catch { /* noop */ }
    })();
  }, [userId]);

  const handleSubscribe = async () => {
    if (!userId) { toast.error('Please sign in first'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Push notifications are not supported on this browser');
      return;
    }
    if (!VAPID_KEY) {
      toast.error('Push notifications not configured yet. Please try again shortly.');
      return;
    }
    setSubscribing(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error('Notification permission denied. Enable it in browser settings.');
        return;
      }
      let reg = await navigator.serviceWorker.getRegistration('/');
      if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_KEY).buffer as ArrayBuffer,
        });
      }
      const p256dh = arrayBufferToBase64(sub.getKey('p256dh'));
      const auth = arrayBufferToBase64(sub.getKey('auth'));

      const { error } = await supabase.from('push_subscriptions').upsert(
        { user_id: userId, endpoint: sub.endpoint, p256dh, auth_key: auth },
        { onConflict: 'user_id,endpoint' }
      );
      if (error) throw error;
      setIsSubscribed(true);
      toast.success('Notifications enabled');
    } catch (e) {
      console.error(e);
      toast.error('Could not enable notifications');
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      toast.success('Notifications disabled');
    } catch {
      toast.error('Could not disable notifications');
    }
  };

  const handleCreateAlert = async () => {
    if (!userId) { toast.error('Please sign in first'); return; }
    const price = parseFloat(target);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid target price');
      return;
    }
    const { error } = await supabase.from('price_alerts').insert({
      user_id: userId, symbol, condition, target_price: price, is_active: true,
    });
    if (error) { toast.error('Could not create alert'); return; }
    setTarget('');
    toast.success('Alert set');
    void loadAlerts();
  };

  const handleDeleteAlert = async (id: string) => {
    const { error } = await supabase.from('price_alerts').delete().eq('id', id);
    if (error) { toast.error('Could not delete alert'); return; }
    void loadAlerts();
  };

  if (!userId) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-[#0d1117] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-[#f0b90b]" />
        <span className="text-sm font-bold text-white">Price Alerts</span>
        <div className="ms-auto">
          {isSubscribed ? (
            <button
              onClick={handleUnsubscribe}
              className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#1a1e2e] px-2.5 py-1.5 text-[11px] font-semibold text-[#c7cdd9] hover:bg-[#252a3a]"
            >
              <BellOff className="h-3.5 w-3.5" /> On
            </button>
          ) : (
            <button
              onClick={handleSubscribe}
              disabled={subscribing || permission === 'denied'}
              className="flex items-center gap-1 rounded-lg bg-[#f0b90b] px-2.5 py-1.5 text-[11px] font-bold text-[#0a0e17] disabled:opacity-50"
            >
              <Bell className="h-3.5 w-3.5" />
              {permission === 'denied' ? 'Blocked' : subscribing ? '...' : 'Notify me'}
            </button>
          )}
        </div>
      </div>

      {permission === 'denied' && (
        <p className="text-[10px] text-[#f6465d]">
          Notifications are blocked. Enable them in your browser settings for this site.
        </p>
      )}

      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-lg border border-white/10 bg-[#0a0e17] px-2 py-2 text-xs font-semibold text-white outline-none focus:border-[#f0b90b]/60"
        >
          {SYMBOLS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as 'above' | 'below')}
          className="rounded-lg border border-white/10 bg-[#0a0e17] px-2 py-2 text-xs font-semibold text-white outline-none focus:border-[#f0b90b]/60"
        >
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input
          inputMode="decimal"
          placeholder="Target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateAlert(); }}
          className="rounded-lg border border-white/10 bg-[#0a0e17] px-2 py-2 text-xs text-white placeholder:text-[#5b6472] outline-none focus:border-[#f0b90b]/60 tabular-nums"
        />
        <button
          onClick={handleCreateAlert}
          className="flex items-center gap-1 rounded-lg bg-[#f0b90b] px-2.5 text-xs font-bold text-[#0a0e17] active:scale-95"
        >
          <Plus className="h-3.5 w-3.5" /> Set
        </button>
      </div>

      {alerts.length === 0 ? (
        <p className="text-center text-[11px] text-[#848e9c]">No alerts yet</p>
      ) : (
        <ul className="space-y-1.5 max-h-56 overflow-y-auto">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-[#0a0e17] px-2.5 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold text-white">{a.symbol}</span>
                <span className="text-[10px] text-[#848e9c]">{a.condition}</span>
                <span className="text-xs font-bold tabular-nums text-[#f0b90b]">
                  {Number(a.target_price).toLocaleString()}
                </span>
                {!a.is_active && (
                  <span className="text-[10px] font-bold text-[#0ecb81]">✓ triggered</span>
                )}
              </div>
              <button
                onClick={() => handleDeleteAlert(a.id)}
                aria-label="Delete alert"
                className="rounded-md p-1.5 text-[#848e9c] hover:bg-white/10 hover:text-[#f6465d]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
