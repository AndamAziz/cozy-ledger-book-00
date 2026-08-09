import { Check, Loader2, Server } from 'lucide-react';
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
    return `${new URL(name).hostname} (${kind === 'xtream' ? 'Xtream' : 'M3U'})`;
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
          className={`flex h-8 max-w-[10rem] shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-[10px] font-bold leading-none text-muted-foreground transition hover:border-border hover:text-foreground active:scale-95 sm:text-[11px] ${className}`}
        >
          {isSwitching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Server className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{active ? safeName(active.name, active.kind) : 'Source'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[60] w-64">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          My IPTV sources
        </DropdownMenuLabel>
        {sources.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => void pick(s.id)} className="gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{safeName(s.name, s.kind)}</span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {s.kind === 'xtream' ? 'Xtream' : 'M3U'} · {s.masked || 'link hidden'}
              </span>
            </span>
            {s.id === active?.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
