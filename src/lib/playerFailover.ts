// Pure, framework-free helpers for the Watch player's automatic server
// fallback. Kept separate from the React component so the failover logic and
// the fallback-URL builder are unit-testable.

export interface PlayerServer {
  name: string;
  url: string;
  accent?: string;
}

export interface ImdbDomain {
  host: string;
  label: string;
  name: string;
  accent: string;
}

export type MediaKind = "movie" | "tv";

/** Build the in-app IMDB embed URL for a given host. */
export function imdbEmbedUrl(
  host: string,
  imdbId: string,
  media: MediaKind,
  season = 1,
  episode = 1,
): string {
  const kind = media === "tv" ? "tv" : "movie";
  const path = media === "tv" ? `${kind}/${imdbId}/${season}/${episode}` : `${kind}/${imdbId}`;
  return `https://www.${host}/embed/${path}`;
}

/** IMDB `/title/` landing URL used as a last-resort fallback. */
export function imdbTitleLandingUrl(host: string, imdbId: string): string {
  return `https://www.${host}/title/${imdbId}/`;
}

/**
 * Build the ordered list of watch servers with automatic fallbacks.
 *
 * Order (each entry is tried in turn by the failover watchdog):
 *  1. IMDB `/embed/movie|tv/...` hosts (when an IMDB id is known)
 *  2. TMDB-based providers: VidAPI, VidSrc, 2Embed
 *  3. IMDB `/title/` landing page (last resort, only when an IMDB id exists)
 */
export function buildWatchServers(opts: {
  imdbId?: string | null;
  tmdbId: number | string;
  media: MediaKind;
  season?: number;
  episode?: number;
  imdbDomains: ImdbDomain[];
}): PlayerServer[] {
  const { imdbId, tmdbId, media, season = 1, episode = 1, imdbDomains } = opts;
  const isTv = media === "tv";
  const servers: PlayerServer[] = [];

  if (imdbId) {
    for (const d of imdbDomains) {
      servers.push({
        name: d.name,
        url: imdbEmbedUrl(d.host, imdbId, media, season, episode),
        accent: d.accent,
      });
    }
  }

  servers.push({
    name: "VidAPI",
    url: isTv
      ? `https://vidapi.ru/embed/tv/${tmdbId}/${season}/${episode}`
      : `https://vidapi.ru/embed/movie/${tmdbId}`,
    accent: "#00BCD4",
  });

  if (imdbId && imdbDomains.length > 0) {
    servers.push({
      name: "IMDb Title",
      url: imdbTitleLandingUrl(imdbDomains[0].host, imdbId),
      accent: "#EAB308",
    });
  }

  return servers;
}

/**
 * Given the currently-active server index, the total number of servers, and the
 * set of indices that have already failed, return the next server index to try.
 *
 * Searches forward and wraps around the list, skipping any failed index.
 * Returns -1 when every server has failed (nothing left to try).
 */
export function nextAvailableServer(
  activeIndex: number,
  total: number,
  failed: Set<number> | number[],
): number {
  if (total <= 0) return -1;
  const failedSet = failed instanceof Set ? failed : new Set(failed);
  const start = Math.min(Math.max(activeIndex, 0), total - 1);
  for (let step = 1; step <= total; step++) {
    const idx = (start + step) % total;
    if (!failedSet.has(idx)) return idx;
  }
  return -1;
}

/** Clamp an index into the valid range for a list of `length` items. */
export function clampIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
