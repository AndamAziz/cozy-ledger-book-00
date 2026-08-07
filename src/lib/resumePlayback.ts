/**
 * Resume playback positions for VOD (movies / series episodes).
 *
 * Positions live in localStorage so a user can close the player — or the whole
 * app — and pick the movie or episode back up where they stopped. Live channels
 * are never stored (there is nothing to resume).
 */

const STORE_KEY = 'ctp.resume.v1';
/** Ignore the first seconds — restoring there is more annoying than useful. */
export const RESUME_MIN_SECONDS = 15;
/** Treat "almost finished" as finished so the next play starts clean. */
export const RESUME_END_MARGIN = 30;
/** Keep the store small: newest entries win. */
const MAX_ENTRIES = 200;

export interface ResumeEntry {
  /** Position in seconds. */
  time: number;
  /** Media length in seconds, when known. */
  duration: number;
  /** Last update, epoch ms. */
  updatedAt: number;
}

type ResumeStore = Record<string, ResumeEntry>;

function readStore(): ResumeStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ResumeStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: ResumeStore): void {
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_ENTRIES) {
      const trimmed: ResumeStore = {};
      keys
        .sort((a, b) => (store[b]?.updatedAt ?? 0) - (store[a]?.updatedAt ?? 0))
        .slice(0, MAX_ENTRIES)
        .forEach((k) => {
          trimmed[k] = store[k];
        });
      store = trimmed;
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage full / disabled — resume is best-effort */
  }
}

/** Stable key for a movie or a specific episode. */
export function resumeKey(channelId: string, episodeId?: string): string {
  return episodeId ? `ep:${episodeId}` : `ch:${channelId}`;
}

/** Stored position for a key, or null when there is nothing worth resuming. */
export function getResume(key: string): ResumeEntry | null {
  const entry = readStore()[key];
  if (!entry || !Number.isFinite(entry.time) || entry.time < RESUME_MIN_SECONDS) return null;
  if (entry.duration > 0 && entry.time > entry.duration - RESUME_END_MARGIN) return null;
  return entry;
}

/**
 * Persist a position. Positions before {@link RESUME_MIN_SECONDS} or within
 * {@link RESUME_END_MARGIN} of the end clear the entry instead.
 */
export function saveResume(key: string, time: number, duration: number): void {
  if (!Number.isFinite(time)) return;
  const finished = duration > 0 && time > duration - RESUME_END_MARGIN;
  if (time < RESUME_MIN_SECONDS || finished) {
    clearResume(key);
    return;
  }
  const store = readStore();
  store[key] = { time, duration: Number.isFinite(duration) ? duration : 0, updatedAt: Date.now() };
  writeStore(store);
}

/** Forget a stored position. */
export function clearResume(key: string): void {
  const store = readStore();
  if (!(key in store)) return;
  delete store[key];
  writeStore(store);
}
