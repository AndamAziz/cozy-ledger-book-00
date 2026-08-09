import { Activity, RotateCw } from 'lucide-react';
import { useProviderHealth, type ProviderHealth } from '@/hooks/useIptvHealth';

function tone(status?: ProviderHealth['status']) {
  if (status === 'online') return { fg: '#28d17c', bg: '#28d17c1a', label: 'Up' };
  if (status === 'slot_limit') return { fg: '#ffb020', bg: '#ffb0201a', label: 'Busy' };
  if (status === 'offline') return { fg: '#ff2d6f', bg: '#ff2d6f1a', label: 'Down' };
  return { fg: '#ffffff8c', bg: '#ffffff10', label: 'Checking' };
}

/** Latency tiers roughly match what a viewer feels when a channel starts. */
function latencyTone(ms?: number) {
  if (ms === undefined) return '#ffffff8c';
  if (ms < 800) return '#28d17c';
  if (ms < 2500) return '#ffb020';
  return '#ff2d6f';
}

/** Provider up/down + latency card, refreshed on the hook's polling interval. */
export function ProviderHealthPanel({ className = '' }: { className?: string }) {
  const { data, isFetching, refetch } = useProviderHealth();
  const t = tone(data?.status);
  const checkedAt = data?.checkedAt ? new Date(data.checkedAt) : null;

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md ${className}`}
      dir="ltr"
    >
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 shrink-0" style={{ color: t.fg }} />
        <p className="text-xs font-bold text-white">Provider health</p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: t.bg, color: t.fg }}
        >
          {t.label}
        </span>
        {data?.latencyMs !== undefined && (
          <span className="text-[11px] font-bold" style={{ color: latencyTone(data.latencyMs) }}>
            {data.latencyMs} ms
          </span>
        )}
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Re-check provider health"
          className="ml-auto rounded-lg p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-white/60">
        {data?.message ?? 'Checking provider…'}
      </p>
      {checkedAt && (
        <p className="mt-1 text-[10px] text-white/35" title={checkedAt.toLocaleString()}>
          Checked {checkedAt.toLocaleTimeString()}
          {data?.cached ? ' · cached' : ''}
          {data?.maxConnections
            ? ` · ${data.activeConnections ?? '?'}/${data.maxConnections} slots`
            : ''}
        </p>
      )}
    </div>
  );
}
