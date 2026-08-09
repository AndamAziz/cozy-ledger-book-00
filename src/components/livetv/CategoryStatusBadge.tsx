import { Loader2, RefreshCw } from 'lucide-react';
import { relativeTime } from '@/lib/iptvProviderStatus';
import { refreshCategoryHealth, type CategoryHealth } from '@/lib/iptvCategoryHealth';

/**
 * Per-category status pill: sampled online ratio + whether the verdict is
 * current ("updated 2m ago") or stale and awaiting the next background probe.
 */
export function CategoryStatusBadge({
  categoryId,
  health,
  stale,
  className = '',
}: {
  categoryId: string;
  health: CategoryHealth;
  stale: boolean;
  className?: string;
}) {
  if (health.checking) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/55 ${className}`}
      >
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Probing
      </span>
    );
  }

  if (!health.checkedAt) return null;

  const allDown = health.online === 0;
  const partial = !allDown && health.online < health.total;
  const fg = stale ? 'rgba(255,255,255,0.55)' : allDown ? '#ff2d6f' : partial ? '#f0b90b' : '#28d17c';
  const bg = stale
    ? 'rgba(255,255,255,0.08)'
    : allDown
      ? 'rgba(255,45,111,0.16)'
      : partial
        ? 'rgba(240,185,11,0.16)'
        : 'rgba(40,209,124,0.16)';

  return (
    <span
      role="status"
      aria-label={`${health.online} of ${health.total} sampled streams online, ${
        stale ? 'stale' : 'updated'
      } ${relativeTime(health.checkedAt ?? undefined)}`}
      title={`Sampled ${health.total} channels · ${stale ? 'stale' : 'updated'} ${relativeTime(health.checkedAt ?? undefined)}`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${className}`}
      style={{ background: bg, color: fg }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${!stale && !allDown ? 'animate-pulse' : ''}`}
        style={{ background: fg }}
      />
      {health.online}/{health.total}
      <span className="font-semibold normal-case tracking-normal opacity-70">
        {stale ? 'stale' : relativeTime(health.checkedAt ?? undefined)}
      </span>
      {stale && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            refreshCategoryHealth(categoryId);
          }}
          aria-label="Re-check this category now"
          className="rounded-full p-0.5 transition hover:bg-white/15"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
