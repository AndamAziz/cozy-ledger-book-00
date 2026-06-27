import { useСallback, useEffect, useState } from "react";

// Lightweight localStorage-backed favorites store for movies & series.
// Stores the full lightweight Movie object so a favorites view can be rendered
// without re-fetching. Components subscribe to stay in sync across the page.

export interface FavMovie {
  tmdb_id: number;
  imdb_id?: string;
  media: "movie" | "tv";
  title: string;
  year?: string;
  poster_url?: string;
  rating?: string;
  genre?: string;
}

const KEY = "movie-favorites";

export const favKey = (media: string, tmdbId: number) => `${media}:${tmdbId}`;

let cache: FavMovie[] | null = null;
const listeners = new Set<() => void>();

function read(): FavMovie[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as FavMovie[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: FavMovie[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode errors */
  }
  listeners.forEach((fn) => fn());
}

export function getFavorites(): FavMovie[] {
  return [...read()];
}

export function isFavorite(media: string, tmdbId: number): boolean {
  return read().some((f) => favKey(f.media, f.tmdb_id) === favKey(media, tmdbId));
}

export function toggleFavorite(movie: FavMovie) {
  const list = read();
  const k = favKey(movie.media, movie.tmdb_id);
  const exists = list.some((f) => favKey(f.media, f.tmdb_id) === k);
  if (exists) {
    write(list.filter((f) => favKey(f.media, f.tmdb_id) !== k));
  } else {
    write([{ ...movie }, ...list]);
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Hook: reactive favorite state + toggle for a single item.
export function useFavorite(movie: FavMovie) {
  const [fav, setFav] = useState(() => isFavorite(movie.media, movie.tmdb_id));
  useEffect(
    () => subscribe(() => setFav(isFavorite(movie.media, movie.tmdb_id))),
    [movie.media, movie.tmdb_id],
  );
  const toggle = useСallback(
    (e?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
      e?.stopPropagation?.();
      e?.preventDefault?.();
      toggleFavorite(movie);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movie.media, movie.tmdb_id, movie.title, movie.poster_url],
  );
  return [fav, toggle] as const;
}

// Hook: reactive list of all favorites.
export function useFavoritesList() {
  const [list, setList] = useState<FavMovie[]>(getFavorites);
  useEffect(() => subscribe(() => setList(getFavorites())), []);
  return list;
}
