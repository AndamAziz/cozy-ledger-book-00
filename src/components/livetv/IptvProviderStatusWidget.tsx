import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, RotateCw } from 'lucide-react';
import {
  readProviderStatus,
  relativeTime,
  type IptvProviderStatus,
} from '@/lib/iptvProviderStatus';

const VERDICT_LABEL: Record<string, string> = {
  waf_block: 'Firewall / bot filter block',
  credentials: 'Credentials rejected',
  rate_limited: 'Rate limited',
  geo_block: 'Geo-blocked',
  unknown: 'Unclassified refusal',
};

/** Live-updating widget: last successful catalogue fetch + most recent verdict. */
export function IptvProviderStatusWidget({
  onRetry,
  refreshing,
  className = '',
}: {
  onRetry?: () => void;
  refreshing?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<IptvProviderStatus>(() => readProviderStatus());
  const [, force] = useState(0);

  useEffect(() => {
    const sync = () => setStatus(readProviderStatus());
    window.addEventListener('iptv-provider-status', sync);
    window.addEventListener('storage', sync);
    // Keep the "x min ago" labels honest without any extra requests.
    const tick = setInterval(() => force((n) => n + 1), 30_000);
    return () => {
      window.removeEventListener('iptv-provider-status', sync);
      window.removeEventListener('storage', sync);
      clearInterval(tick);
    };
  }, []);

  if (!status.lastSuccessAt && !status.lastFailureAt) return null;

  const failedLast =
    !!status.lastFailureAt &&
    (!status.lastSuccessAt || new Date(status.lastFailureAt) > new Date(status.lastSuccessAt));

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md ${className}`}
      dir="ltr"
    >
      <div className="flex items-center gap-2">
        {failedLast ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#ff2d6f]" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        )}
        <p className="text-xs font-bold text-white">Provider status</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={refreshing}
            aria-label="Re-check provider"
            className="ml-auto rounded-lg p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
        <p className="flex items-center gap-1.5 text-white/60">
          <Clock className="h-3 w-3 shrink-0 text-white/35" />
          <span className="font-semibold text-white/80">Last successful fetch:</span>
          {status.lastSuccessAt ? (
            <span title={new Date(status.lastSuccessAt).toLocaleString()}>
              {relativeTime(status.lastSuccessAt)}
              {typeof status.lastSuccessTotal === 'number' && ` · ${status.lastSuccessTotal} items`}
            </span>
          ) : (
            <span className="text-white/40">never</span>
          )}
        </p>

        {status.lastVerdict && (
          <div className="text-white/60">
            <p className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-white/80">Last verdict:</span>
              <span className="rounded-md bg-[#ff2d6f]/15 px-1.5 py-0.5 font-semibold text-[#ff8fb1]">
                {VERDICT_LABEL[status.lastVerdict] ?? status.lastVerdict}
              </span>
              {status.lastStatus ? (
                <span className="font-mono text-[10px] text-white/45">HTTP {status.lastStatus}</span>
              ) : null}
              <span className="text-white/40">{relativeTime(status.lastFailureAt)}</span>
            </p>
            {status.lastReason && <p className="mt-1 text-white/45">{status.lastReason}</p>}
            {status.lastReqId && (
              <p className="mt-1 font-mono text-[10px] text-white/35">reqId: {status.lastReqId}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
