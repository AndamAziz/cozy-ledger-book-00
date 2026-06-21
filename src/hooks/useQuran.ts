// Hook-only module (HMR-safe React Fast Refresh boundary).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  getStoredReciter,
  setStoredReciter,
  DEFAULT_FONT,
  DEFAULT_RECITER,
  RECITERS,
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

interface RemotePrefs {
  bookmarks: string[];
  last_read: LastRead | null;
  reciter: string;
  font_size: number;
}

/**
 * Consolidated Quran preferences hook with optional account sync.
 *
 * - Initializes instantly from localStorage (offline / logged-out friendly).
 * - When a userId is provided, pulls the user's row from `quran_preferences`,
 *   merges it with local state (bookmarks are unioned), and writes the merged
 *   result back so the account becomes the source of truth across devices.
 * - Every setter writes to localStorage AND (when logged in) upserts to the DB.
 */
export function useQuranPrefs(userId: string | null) {
  const [fontSize, setFontSizeState] = useState<number>(() => getStoredFontSize());
  const [bookmarks, setBookmarksState] = useState<string[]>(() => getBookmarks());
  const [lastRead, setLastReadState] = useState<LastRead | null>(() => getLastRead());
  const [reciter, setReciterState] = useState<string>(() => getStoredReciter());
  const [synced, setSynced] = useState(false);

  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  // Upsert a partial set of fields to the DB for the current user.
  const persistRemote = useCallback(
    (patch: Partial<RemotePrefs>) => {
      const uid = userIdRef.current;
      if (!uid) return;
      void supabase
        .from('quran_preferences')
        .upsert(
          { user_id: uid, ...patch } as never,
          { onConflict: 'user_id' },
        )
        .then(({ error }) => {
          if (error) console.error('Quran prefs sync failed:', error.message);
        });
    },
    [],
  );

  // Pull + merge on login.
  useEffect(() => {
    if (!userId) {
      setSynced(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('quran_preferences')
        .select('bookmarks, last_read, reciter, font_size')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('Quran prefs load failed:', error.message);
        return;
      }

      const localBookmarks = getBookmarks();
      const localLastRead = getLastRead();
      const localFont = getStoredFontSize();
      const localReciter = getStoredReciter();

      if (data) {
        const remote = data as unknown as RemotePrefs;
        const mergedBookmarks = Array.from(
          new Set([...(remote.bookmarks ?? []), ...localBookmarks]),
        );
        const mergedReciter =
          remote.reciter && RECITERS.some((r) => r.id === remote.reciter)
            ? remote.reciter
            : localReciter;
        const mergedFont = remote.font_size || localFont;
        const mergedLastRead = remote.last_read ?? localLastRead;

        setBookmarksState(mergedBookmarks);
        setBookmarks(mergedBookmarks);
        setReciterState(mergedReciter);
        setStoredReciter(mergedReciter);
        setFontSizeState(mergedFont);
        setStoredFontSize(mergedFont);
        if (mergedLastRead) {
          setLastReadState(mergedLastRead);
          setLastRead(mergedLastRead);
        }

        // Write merged result back so other devices converge.
        persistRemote({
          bookmarks: mergedBookmarks,
          reciter: mergedReciter,
          font_size: mergedFont,
          last_read: mergedLastRead,
        });
      } else {
        // First time for this user — seed from local state.
        persistRemote({
          bookmarks: localBookmarks,
          reciter: localReciter,
          font_size: localFont,
          last_read: localLastRead,
        });
      }
      setSynced(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const setFontSize = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_FONT, Math.max(MIN_FONT, next));
      setFontSizeState(clamped);
      setStoredFontSize(clamped);
      persistRemote({ font_size: clamped });
    },
    [persistRemote],
  );

  const isBookmarked = useCallback(
    (surah: number, ayah: number) => bookmarks.includes(bookmarkKey(surah, ayah)),
    [bookmarks],
  );

  const toggleBookmark = useCallback(
    (surah: number, ayah: number) => {
      setBookmarksState((prev) => {
        const key = bookmarkKey(surah, ayah);
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        setBookmarks(next);
        persistRemote({ bookmarks: next });
        return next;
      });
    },
    [persistRemote],
  );

  const saveLastRead = useCallback(
    (value: LastRead) => {
      setLastReadState(value);
      setLastRead(value);
      persistRemote({ last_read: value });
    },
    [persistRemote],
  );

  const setReciter = useCallback(
    (id: string) => {
      setReciterState(id);
      setStoredReciter(id);
      persistRemote({ reciter: id });
    },
    [persistRemote],
  );

  return {
    fontSize,
    setFontSize,
    bookmarks,
    isBookmarked,
    toggleBookmark,
    lastRead,
    saveLastRead,
    reciter,
    setReciter,
    synced,
    DEFAULT_FONT,
    DEFAULT_RECITER,
    MIN_FONT,
    MAX_FONT,
  };
}
