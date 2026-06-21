// Hook-only module (HMR-safe React Fast Refresh boundary).
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchSurahList,
  fetchSurahDetail,
  getStoredFontSize,
  setStoredFontSize,
  getBookmarks,
  setBookmarks,
  bookmarkKey,
  getLastRead,
  setLastRead,
  DEFAULT_FONT,
  MIN_FONT,
  MAX_FONT,
  type LastRead,
} from '@/lib/quran';

export function useSurahList() {
  return useQuery({
    queryKey: ['quran', 'surah-list'],
    queryFn: ({ signal }) => fetchSurahList(signal),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSurahDetail(surahNumber: number | null) {
  return useQuery({
    queryKey: ['quran', 'surah', surahNumber],
    queryFn: ({ signal }) => fetchSurahDetail(surahNumber as number, signal),
    enabled: surahNumber != null,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
  });
}

export function useQuranFontSize() {
  const [fontSize, setFontSize] = useState<number>(() => getStoredFontSize());

  const update = useCallback((next: number) => {
    const clamped = Math.min(MAX_FONT, Math.max(MIN_FONT, next));
    setFontSize(clamped);
    setStoredFontSize(clamped);
  }, []);

  return { fontSize, setFontSize: update, DEFAULT_FONT, MIN_FONT, MAX_FONT };
}

export function useQuranBookmarks() {
  const [bookmarks, setBookmarksState] = useState<string[]>(() => getBookmarks());

  const isBookmarked = useCallback(
    (surah: number, ayah: number) => bookmarks.includes(bookmarkKey(surah, ayah)),
    [bookmarks],
  );

  const toggleBookmark = useCallback((surah: number, ayah: number) => {
    setBookmarksState((prev) => {
      const key = bookmarkKey(surah, ayah);
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setBookmarks(next);
      return next;
    });
  }, []);

  return { bookmarks, isBookmarked, toggleBookmark };
}

export function useLastRead() {
  const [lastRead, setLastReadState] = useState<LastRead | null>(() => getLastRead());

  const save = useCallback((value: LastRead) => {
    setLastReadState(value);
    setLastRead(value);
  }, []);

  return { lastRead, saveLastRead: save };
}

// Persist last-read position when a surah is opened.
export function usePersistLastRead(
  enabled: boolean,
  value: LastRead | null,
  save: (v: LastRead) => void,
) {
  useEffect(() => {
    if (enabled && value) {
      save(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, value?.surah]);
}
