// Shared types + pure helpers for the movie/show "Details" tab.
// Kept framework-free so the field-selection logic is unit-testable.

export interface TmdbEpisode {
  air_date?: string | null;
  episode_number?: number | null;
  season_number?: number | null;
  name?: string | null;
  runtime?: number | null;
}

export interface TmdbDetails {
  overview?: string;
  // Movies
  runtime?: number;
  release_date?: string;
  // TV
  episode_run_time?: number[];
  first_air_date?: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  last_episode_to_air?: TmdbEpisode | null;
  next_episode_to_air?: TmdbEpisode | null;
  // Shared
  original_language?: string;
  production_countries?: { iso_3166_1: string; name: string }[];
  created_by?: { id: number; name: string }[];
  credits?: {
    cast?: {
      id: number;
      name: string;
      character?: string;
      profile_path: string | null;
    }[];
    crew?: { id: number; name: string; job: string }[];
  };
}


/**
 * Pick the correct runtime for the media type.
 * - Movies: `runtime` (minutes)
 * - TV: first positive `episode_run_time`, falling back to the runtime of the
 *   last aired episode (some series omit `episode_run_time`).
 */
export function pickRuntime(
  isTv: boolean,
  d: TmdbDetails,
): number | undefined {
  if (isTv) {
    const ert = (d.episode_run_time || []).find((n) => typeof n === "number" && n > 0);
    if (ert) return ert;
    const last = d.last_episode_to_air?.runtime;
    return typeof last === "number" && last > 0 ? last : undefined;
  }
  return typeof d.runtime === "number" && d.runtime > 0 ? d.runtime : undefined;
}

/**
 * Pick the correct date field for the media type.
 * - Movies: `release_date`
 * - TV: `first_air_date`
 */
export function pickReleaseDate(
  isTv: boolean,
  d: TmdbDetails,
): string | undefined {
  const value = isTv ? d.first_air_date : d.release_date;
  return value && value.trim() ? value : undefined;
}

/** Up-to-2-letter initials used as a fallback when a cast photo is missing/broken. */
export function initialsFromName(name: string): string {
  const parts = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const letters = parts
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
  return letters || "?";
}
