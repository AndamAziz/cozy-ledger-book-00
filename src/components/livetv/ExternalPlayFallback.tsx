import { ExternalLink } from 'lucide-react';
import { externalPlayerTargets } from '@/lib/externalPlayer';

/**
 * Shown when the browser has no decoder for the file (HEVC video, Dolby/DTS
 * audio). The stream itself is healthy, so we hand the exact same URL to a
 * player that carries its own decoders instead of pretending it is broken.
 */
export function ExternalPlayFallback({ src, compact = false }: { src: string; compact?: boolean }) {
  const targets = externalPlayerTargets(src);

  return (
    <div className={`flex flex-wrap items-center justify-center gap-1.5 ${compact ? '' : 'mt-1'}`}>
      {targets.map((t) => (
        <a
          key={t.id}
          href={t.href}
          title={`Open in ${t.label}`}
          className="flex items-center gap-1 rounded-full border border-white/20 bg-white/[0.08] px-2.5 py-1 text-[10px] font-bold text-white/85 transition hover:border-white/40 hover:text-white active:scale-95"
        >
          <ExternalLink className="h-3 w-3" />
          {t.label}
        </a>
      ))}
    </div>
  );
}

