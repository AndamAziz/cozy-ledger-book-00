import { ExternalLink } from 'lucide-react';
import { openInExternalPlayer, primaryExternalPlayer } from '@/lib/externalPlayer';

/**
 * Shown when the browser has no decoder for the file (HEVC video, Dolby/DTS
 * audio). One device-aware button that jumps straight into the player app —
 * rendered as a <button> so there is no link to right-click, copy or share.
 */
export function ExternalPlayFallback({ src, compact = false }: { src: string; compact?: boolean }) {
  const target = primaryExternalPlayer(src);

  return (
    <div className={`flex items-center justify-center ${compact ? '' : 'mt-1'}`}>
      <button
        type="button"
        onClick={() => openInExternalPlayer(src)}
        onContextMenu={(e) => e.preventDefault()}
        title={`Open in ${target.label}`}
        className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/[0.08] px-3 py-1 text-[10px] font-bold text-white/85 transition hover:border-white/40 hover:text-white active:scale-95"
      >
        <ExternalLink className="h-3 w-3" />
        Open in {target.label}
      </button>
    </div>
  );
}
