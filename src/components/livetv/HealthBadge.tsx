import type { ChannelStatus } from '@/lib/iptvHealth';

const STYLES: Record<Exclude<ChannelStatus, 'unknown'>, { label: string; bg: string; fg: string }> = {
  checking: { label: 'Checking', bg: 'rgba(255,255,255,0.10)', fg: 'rgba(255,255,255,0.55)' },
  online: { label: 'Online', bg: 'rgba(40,209,124,0.16)', fg: '#28d17c' },
  busy: { label: 'Busy', bg: 'rgba(240,185,11,0.16)', fg: '#f0b90b' },
  offline: { label: 'Offline', bg: 'rgba(255,45,111,0.16)', fg: '#ff2d6f' },
};

/** ONLINE / BUSY / OFFLINE pill driven by the periodic provider + channel probes. */
export function HealthBadge({ status, className = '' }: { status: ChannelStatus; className?: string }) {
  // Slot-limit ('busy') is intentionally never surfaced in the UI.
  if (status === 'unknown' || status === 'busy') return null;
  const s = STYLES[status];
  return (
    <span
      role="status"
      aria-label={`Stream ${s.label}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${className}`}
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'online' ? 'animate-pulse' : ''}`}
        style={{ background: s.fg, boxShadow: status === 'online' ? `0 0 8px ${s.fg}` : undefined }}
      />
      {s.label}
    </span>
  );
}
