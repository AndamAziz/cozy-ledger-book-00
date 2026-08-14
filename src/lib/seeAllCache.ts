/**
 * Tiny in-memory cache for the LiveTV "See All" view.
 *
 * React Query already caches the fetched pages (1h stale / 2h gc), but the view
 * itself used to restart at page 1 with a cleared filter and scroll position on
 * every navigation, forcing a fresh network round-trip. Remembering how deep the
 * user paged means the same query key is requested again and answered straight
 * from cache — no refetch, no skeletons.
 */
export interface SeeAllState {
  limit: number;
  q: string;
  scrollY: number;
}

const store = new Map<string, SeeAllState>();

export const seeAllKey = (kind: string, categoryId: string) => `${kind}:${categoryId}`;

export function getSeeAllState(key: string): SeeAllState | undefined {
  return store.get(key);
}

export function setSeeAllState(key: string, state: Partial<SeeAllState>) {
  const prev = store.get(key) ?? { limit: 0, q: '', scrollY: 0 };
  store.set(key, { ...prev, ...state });
}

export function clearSeeAllCache() {
  store.clear();
}
