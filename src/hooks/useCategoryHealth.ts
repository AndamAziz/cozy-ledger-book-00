import { useEffect, useState } from 'react';
import {
  CATEGORY_SAMPLE,
  getCategoryHealth,
  isStale,
  registerCategorySample,
  startCategoryHealthSweep,
  subscribeCategoryHealth,
  unregisterCategorySample,
  type CategoryHealth,
} from '@/lib/iptvCategoryHealth';
import { toPlayableUrl, type IptvChannel, type IptvKind } from './useIptvPlaylist';

/**
 * Registers a category's channel sample with the background health worker and
 * returns its live verdict plus whether that verdict has gone stale.
 */
export function useCategoryHealth(
  categoryId: string,
  channels: Pick<IptvChannel, 'id' | 'ext'>[] | undefined,
  kind: IptvKind,
  enabled = true,
): CategoryHealth & { stale: boolean } {
  const [health, setHealth] = useState<CategoryHealth>(() => getCategoryHealth(categoryId));
  const [, force] = useState(0);

  const sampleKey = (channels ?? [])
    .slice(0, CATEGORY_SAMPLE)
    .map((c) => c.id)
    .join(',');

  useEffect(() => startCategoryHealthSweep(), []);

  useEffect(() => {
    setHealth(getCategoryHealth(categoryId));
    const off = subscribeCategoryHealth(categoryId, setHealth);
    if (enabled && sampleKey) {
      registerCategorySample(
        categoryId,
        (channels ?? [])
          .slice(0, CATEGORY_SAMPLE)
          .map((c) => toPlayableUrl(c.id, kind, c.ext)),
      );
    }
    return () => {
      off();
      unregisterCategorySample(categoryId);
    };
    // channels is intentionally tracked through sampleKey to avoid re-registering
    // on every array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, sampleKey, kind, enabled]);

  // Keep the "updated x ago" / stale flip honest without extra requests.
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return { ...health, stale: isStale(health) };
}
