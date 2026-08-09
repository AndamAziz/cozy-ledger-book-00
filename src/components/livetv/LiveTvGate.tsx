import { createContext, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Server, ShieldCheck, Timer, ArrowLeft } from 'lucide-react';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import { useLiveTvAccess, formatCountdown } from '@/hooks/useLiveTvAccess';
import { LiveTvStatusPanel } from '@/components/livetv/LiveTvStatusPanel';
import { IptvSourceManager } from '@/components/livetv/IptvSourceManager';
import { supabase } from '@/integrations/supabase/client';

export interface LiveTvSourcesContextValue {
  canManage: boolean;
  openSourceManager: () => void;
}

const LiveTvSourcesContext = createContext<LiveTvSourcesContextValue | null>(null);

export const useLiveTvSources = () => useContext(LiveTvSourcesContext);


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

/**
 * Gates the Live TV experience: sign-in → personal server → trial / paid access.
 * Renders `children` only when the account is fully entitled and configured.
 */
export function LiveTvGate({ children }: { children: React.ReactNode }) {
  const { user, access, hasServer, isLoading, refresh } = useLiveTvAccess();
  const [payOpen, setPayOpen] = useState(false);
  const [editServer, setEditServer] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsOwner(false);
      return;
    }
    void supabase.rpc('has_role', { _user_id: user.id, _role: 'owner' }).then(({ data }) => {
      setIsOwner(!!data);
    });
  }, [user]);

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

  // Regular users can never add a link — the owner assigns one to their account.
  if (!hasServer && !isOwner) {
    return (
      <div className={SHELL}>
        <Server className="h-8 w-8 text-[#ff2d6f]" />
        <h1 className="text-lg font-extrabold">No provider link yet</h1>
        <p className="max-w-sm text-xs leading-relaxed text-white/45">
          Live TV is enabled for your account, but the admin has not assigned a provider link to it
          yet. Contact us on Telegram <span dir="ltr">@AndamAziz</span> or email{' '}
          <span dir="ltr">info@andam.uk</span> and it will be added for you.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] font-bold text-white/40 underline underline-offset-4"
        >
          Refresh status
        </button>
        <BackHome />
      </div>
    );
  }

  // Entitled but no personal provider link yet, or managing sources.
  if (!hasServer || editServer) {
    return (
      <div className={`${SHELL} py-10`}>
        <Server className="h-8 w-8 text-[#ff2d6f]" />
        <h1 className="text-lg font-extrabold">
           {isOwner ? 'Your IPTV sources' : 'Your channels source'}
        </h1>
        <p className="max-w-sm text-xs leading-relaxed text-white/45">
           {isOwner
            ? 'Add one or more playlists (M3U or Xtream). Test a link before saving and switch between sources any time — each one loads only its own channels.'
            : 'Switch between the sources assigned to your account. Only the admin can add or change links.'}
        </p>
        <IptvSourceManager
          canManage={isOwner}
          onChanged={() => {
            void refresh();
          }}
        />
        {hasServer && (
          <button
            type="button"
            onClick={() => setEditServer(false)}
            className="text-[11px] font-bold text-white/40 underline underline-offset-4"
          >
            Done — back to Live TV
          </button>
        )}
        <BackHome />
      </div>
    );
  }


  return (
    <LiveTvSourcesContext.Provider
      value={{ canManage: isOwner, openSourceManager: () => setEditServer(true) }}
    >
      {access && !access.isActivated && (
        <div className="flex flex-wrap items-center justify-center gap-2 bg-gradient-to-r from-[#ff2d6f]/20 to-[#b026ff]/20 px-4 py-2 text-center text-[11px] font-bold text-white">
          <Timer className="h-3.5 w-3.5 text-[#ff2d6f]" />
          Free trial ends in {formatCountdown(access.msLeft)} · £40 unlocks it permanently
        </div>
      )}
      {children}
    </LiveTvSourcesContext.Provider>
  );
}
