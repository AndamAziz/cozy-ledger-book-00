import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Radio, Server, ShieldAlert, Timer } from 'lucide-react';
import { useLiveTvAccess, formatCountdown } from '@/hooks/useLiveTvAccess';

/**
 * Real-time Live TV status: remaining trial, activation state, provider link
 * (masked) and the exact next step. Used in the dashboard and the player gate.
 */
export function LiveTvStatusPanel({ compact = false }: { compact?: boolean }) {
  const { user, access, server, hasServer, isLoading } = useLiveTvAccess();

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your Live TV status…
      </div>
    );
  }

  const activated = !!access?.isActivated;
  const trialLive = !activated && (access?.msLeft ?? 0) > 0;
  const expired = !activated && !trialLive;

  const state = activated
    ? { label: 'Activated', tone: 'text-emerald-400', Icon: CheckCircle2, ring: 'border-emerald-400/30' }
    : trialLive
      ? { label: 'Free trial', tone: 'text-amber-400', Icon: Timer, ring: 'border-amber-400/30' }
      : { label: 'Locked', tone: 'text-rose-400', Icon: ShieldAlert, ring: 'border-rose-400/30' };

  const nextStep = !hasServer
    ? 'Add your personal IPTV playlist link to start streaming.'
    : expired
      ? 'Your trial has ended — a one-time £40 activation unlocks Live TV permanently.'
      : trialLive
        ? `Trial ends in ${formatCountdown(access?.msLeft ?? 0)} · activate for £40 to keep watching.`
        : 'Everything is set — enjoy Live TV.';

  return (
    <div className={`space-y-3 rounded-2xl border bg-white/[0.03] p-4 ${state.ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Radio className="h-4 w-4 text-[#ff2d6f]" />
        <span className="text-sm font-extrabold text-white">Live TV</span>
        <span
          className={`ms-auto flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-bold ${state.tone}`}
        >
          <state.Icon className="h-3.5 w-3.5" />
          {state.label}
        </span>
      </div>

      {trialLive && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-white/60">
            <span>Trial remaining</span>
            <span className="tabular-nums text-amber-300">
              {formatCountdown(access?.msLeft ?? 0)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ff2d6f] to-[#b026ff] transition-[width] duration-1000"
              style={{
                width: `${Math.min(100, Math.max(0, ((access?.msLeft ?? 0) / 86_400_000) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {!compact && (
        <div className="flex items-center gap-2 text-[11px] text-white/45">
          <Server className="h-3.5 w-3.5 shrink-0" />
          <span dir="ltr" className="truncate">
            {hasServer ? server?.masked || 'Your private server is saved' : 'No server saved yet'}
          </span>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-white/55">{nextStep}</p>

      <Link
        to="/live-tv"
        className="inline-flex rounded-xl px-4 py-2 text-[11px] font-extrabold text-white"
        style={{ background: 'linear-gradient(90deg,#ff2d6f,#b026ff)' }}
      >
        {!hasServer ? 'Add my server' : expired ? 'Activate for £40' : 'Open Live TV'}
      </Link>
    </div>
  );
}
