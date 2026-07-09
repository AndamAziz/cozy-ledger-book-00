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

export interface TvSummary {
  seasons: number;
  episodes: number;
  runtime?: number;
  status?: string;
}

/**
 * Build a compact season/episode + per-episode runtime summary for a TV series.
 * Returns null when there is nothing meaningful to show.
 */
export function tvSummary(d: TmdbDetails): TvSummary | null {
  const seasons = typeof d.number_of_seasons === "number" ? d.number_of_seasons : 0;
  const episodes = typeof d.number_of_episodes === "number" ? d.number_of_episodes : 0;
  const runtime = pickRuntime(true, d);
  const status = d.status && d.status.trim() ? d.status.trim() : undefined;
  if (!seasons && !episodes && !runtime && !status) return null;
  return { seasons, episodes, runtime, status };
}

export interface NextEpisodeInfo {
  season?: number;
  episode?: number;
  code?: string; // e.g. "S02E05"
  name?: string;
  airDate?: string;
}

/** Normalize the upcoming episode into display-friendly fields, or null if none. */
export function nextEpisode(d: TmdbDetails): NextEpisodeInfo | null {
  const n = d.next_episode_to_air;
  if (!n) return null;
  const season = typeof n.season_number === "number" ? n.season_number : undefined;
  const episode = typeof n.episode_number === "number" ? n.episode_number : undefined;
  const airDate = n.air_date && n.air_date.trim() ? n.air_date : undefined;
  const name = n.name && n.name.trim() ? n.name : undefined;
  if (season === undefined && episode === undefined && !airDate && !name) return null;
  const code =
    season !== undefined && episode !== undefined
      ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
      : undefined;
  return { season, episode, code, name, airDate };
}

