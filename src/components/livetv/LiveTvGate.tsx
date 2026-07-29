import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Server, ShieldCheck, Timer, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { useLiveTvAccess, formatCountdown } from '@/hooks/useLiveTvAccess';
import { LiveTvStatusPanel } from '@/components/livetv/LiveTvStatusPanel';

/** One-time £40 Live TV activation price (see payments catalogue). */
const ACTIVATION_PRICE_ID = 'ctp_livetv_activation_4000gbp';

const SHELL =
  'flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#07070b] px-6 text-center text-white';

function BackHome() {
  return (
    <Link
      to="/"
      className="mt-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-white/25 hover:text-white"
    >
      <ArrowLeft className="h-3 w-3" /> Back home
    </Link>
  );
}

/** Personal provider link editor — shown until the user saves their own URL. */
function ServerForm({
  maskedUrl,
  onSaved,
}: {
  maskedUrl: string;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('iptv-test', { body: { url } });
      if (error) throw error;
      if (data?.ok) toast.success(data.message ?? 'Your IPTV server is reachable');
      else toast.error(data?.message ?? 'Could not reach that IPTV server');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('Enter a full http(s) playlist or Xtream URL');
      return;
    }
    setSaving(true);
    // Stored through the vault function so the link is encrypted at rest and
    // never written to a table the browser can read.
    const { data, error } = await supabase.functions.invoke('iptv-server', {
      body: { action: 'save', playlistUrl: trimmed },
    });
    setSaving(false);
    if (error || data?.error) {
      toast.error(data?.error ?? error?.message ?? 'Could not save your server');
      return;
    }
    setUrl('');
    toast.success('Your IPTV server was saved securely');
    onSaved();
  };

  return (
    <div className="w-full max-w-md space-y-3 text-left">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        dir="ltr"
        placeholder="http://your-provider.tv/get.php?username=…&password=…"
        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#ff2d6f]/60"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={test}
          disabled={testing || !url.trim()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-xs font-bold text-white/75 transition hover:border-white/25 hover:text-white disabled:opacity-40"
        >
          {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Test
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !url.trim()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold text-white transition disabled:opacity-40"
          style={{ background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save server
        </button>
      </div>
      {maskedUrl && (
        <p dir="ltr" className="truncate text-[11px] font-bold text-white/45">
          Saved: {maskedUrl}
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-white/40">
        Your link is encrypted before it is stored, is never shown again in full, and is never
        shared with other users.
      </p>
    </div>
  );
}

/**
 * Gates the Live TV experience: sign-in → personal server → trial / paid access.
 * Renders `children` only when the account is fully entitled and configured.
 */
export function LiveTvGate({ children }: { children: React.ReactNode }) {
  const { user, access, server, hasServer, isLoading, refresh } = useLiveTvAccess();
  const [payOpen, setPayOpen] = useState(false);
  const [editServer, setEditServer] = useState(false);

  if (isLoading) {
    return (
      <div className={SHELL}>
        <Loader2 className="h-7 w-7 animate-spin text-[#ff2d6f]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={SHELL}>
        <Lock className="h-8 w-8 text-[#ff2d6f]" />
        <h1 className="text-lg font-extrabold">Sign in to watch Live TV</h1>
        <p className="max-w-sm text-xs text-white/45">
          Live TV streams from your own provider account, so you need to be signed in.
        </p>
        <Link
          to="/auth"
          className="rounded-xl px-5 py-2.5 text-xs font-extrabold text-white"
          style={{ background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
        >
          Sign in
        </Link>
        <BackHome />
      </div>
    );
  }

  // Trial expired and never activated → paywall.
  if (access && !access.hasAccess) {
    return (
      <div className={SHELL}>
        <ShieldCheck className="h-8 w-8 text-[#b026ff]" />
        <h1 className="text-lg font-extrabold">Your free trial has ended</h1>
        <p className="max-w-sm text-xs leading-relaxed text-white/45">
          Unlock Live TV permanently with a one-time £40 activation. Movies, series, replay and
          live channels all stream from your own provider account.
        </p>
        {payOpen ? (
          <div className="w-full max-w-lg pt-2">
            <StripeEmbeddedCheckout
              priceId={ACTIVATION_PRICE_ID}
              customerEmail={user.email ?? undefined}
              userId={user.id}
              purpose="livetv_activation"
              returnUrl={`${window.location.origin}/live-tv?activation=success&session_id={CHECKOUT_SESSION_ID}`}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPayOpen(true)}
            className="rounded-xl px-6 py-3 text-sm font-extrabold text-white"
            style={{ background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
          >
            Activate for £40
          </button>
        )}
        <div className="w-full max-w-md pt-2 text-left">
          <LiveTvStatusPanel />
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] font-bold text-white/40 underline underline-offset-4"
        >
          I already paid — refresh status
        </button>
        <BackHome />
      </div>
    );
  }

  // Entitled but no personal provider link yet.
  if (!hasServer || editServer) {
    return (
      <div className={SHELL}>
        <Server className="h-8 w-8 text-[#ff2d6f]" />
        <h1 className="text-lg font-extrabold">Add your IPTV server</h1>
        <p className="max-w-sm text-xs leading-relaxed text-white/45">
          Paste your personal M3U playlist or Xtream Codes URL. Live TV will stream only from your
          own subscription.
        </p>
        <ServerForm
          maskedUrl={server?.masked ?? ''}
          onSaved={() => {
            setEditServer(false);
            void refresh();
          }}
        />
        {hasServer && (
          <button
            type="button"
            onClick={() => setEditServer(false)}
            className="text-[11px] font-bold text-white/40 underline underline-offset-4"
          >
            Cancel
          </button>
        )}
        <BackHome />
      </div>
    );
  }

  return (
    <>
      {access && !access.isActivated && (
        <div className="flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-[#ff2d6f]/20 to-[#b026ff]/20 px-4 py-2 text-center text-[11px] font-bold text-white">
          <Timer className="h-3.5 w-3.5 text-[#ff2d6f]" />
          Free trial ends in {formatCountdown(access.msLeft)} · £40 unlocks it permanently
        </div>
      )}
      <div className="flex justify-end bg-[#07070b] px-4 pt-2">
        <button
          type="button"
          onClick={() => setEditServer(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-bold text-white/60 transition hover:border-white/25 hover:text-white"
        >
          <Server className="h-3 w-3" /> My server
        </button>
      </div>
      {children}
    </>
  );
}
