import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { setActiveSourceId } from './useIptvPlaylist';

/**
 * Providers the signed-in account is allowed to browse.
 *
 * An account can hold several IPTV servers (assigned by the CEO). Exactly one is
 * "selected" at a time; switching is instant and re-points every catalogue and
 * playback request server-side.
 */
export interface IptvSource {
  id: string;
  name: string;
  kind: string;
  masked: string;
  isDefault: boolean;
  health?: string | null;
  healthMessage?: string | null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('iptv-server', { body });
  if (error) throw new Error(error.message);
  const payload = data as { error?: string } & T;
  if (payload?.error) throw new Error(payload.error);
  return payload as T;
}

export function useIptvSources() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['iptv-my-sources'],
    queryFn: async () => {
      const { sources } = await call<{ sources: IptvSource[] }>({ action: 'my_sources' });
      const list = sources ?? [];
      setActiveSourceId(list.find((s) => s.isDefault)?.id ?? list[0]?.id ?? null);
      return list;
    },
    staleTime: 5 * 60 * 1000,
  });

  const select = useMutation({
    mutationFn: async (id: string) => {
      const res = await call<{ sources: IptvSource[] }>({ action: 'select_source', id });
      setActiveSourceId(id);
      return res.sources ?? [];
    },
    onSuccess: (sources) => {
      qc.setQueryData(['iptv-my-sources'], sources);
      // The catalogue belongs to the previous provider — drop all of it.
      qc.removeQueries({ queryKey: ['iptv-index'] });
      qc.removeQueries({ queryKey: ['iptv-channels'] });
      qc.removeQueries({ queryKey: ['iptv-search'] });
      qc.removeQueries({ queryKey: ['iptv-series'] });
      qc.invalidateQueries({ queryKey: ['iptv-health'] });
    },
  });

  const sources = query.data ?? [];
  return {
    sources,
    /** Only worth showing a picker when there is something to pick. */
    hasChoice: sources.length > 1,
    active: sources.find((s) => s.isDefault) ?? sources[0] ?? null,
    isLoading: query.isLoading,
    selectSource: select.mutateAsync,
    isSwitching: select.isPending,
  };
}
