import { Check, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIptvSources } from '@/hooks/useIptvSources';

/**
 * Some legacy source rows were named with the raw provider URL, which contains
 * credentials — never render those verbatim.
 */
function safeName(name: string, kind: string) {
  if (!/^https?:\/\//i.test(name)) return name;
  try {
    return new URL(name).hostname;
  } catch {
    return kind === 'xtream' ? 'Xtream server' : 'M3U playlist';
  }
}

/**
 * Provider switcher — rendered only for accounts that hold more than one IPTV
 * server. Single-source users never see it.
 */
export function SourcePicker({ className = '' }: { className?: string }) {
  const { sources, hasChoice, active, selectSource, isSwitching } = useIptvSources();
  if (!hasChoice) return null;

  const pick = async (id: string) => {
    if (id === active?.id) return;
    try {
      await selectSource(id);
      const picked = sources.find((s) => s.id === id);
      toast.success(`Switched to ${picked ? safeName(picked.name, picked.kind) : 'source'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch source');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-tv
          aria-label="Switch IPTV source"
          title={active ? `Source: ${safeName(active.name, active.kind)}` : 'Switch IPTV source'}
          className={`shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground active:scale-90 ${className}`}
        >
          {isSwitching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Layers className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] w-56 p-1">
        <DropdownMenuLabel className="px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          My IPTV sources
        </DropdownMenuLabel>
        {sources.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onSelect={() => void pick(s.id)}
            title={s.masked || undefined}
            className="min-h-0 gap-1.5 px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1 truncate font-semibold">{safeName(s.name, s.kind)}</span>
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {s.kind === 'xtream' ? 'XT' : 'M3U'}
            </span>
            {s.id === active?.id ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

