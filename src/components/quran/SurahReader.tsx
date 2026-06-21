import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Play, Pause, Bookmark, BookmarkCheck, Minus, Plus, MapPin, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SurahDetail } from '@/lib/quran';
import { RECITERS, ayahAudioUrl, getReciterName } from '@/lib/quran';
import type { QuranStrings } from '@/lib/quranI18n';

const BISMILLAH = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';

interface SurahReaderProps {
  surah: SurahDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onBack: () => void;
  fontSize: number;
  setFontSize: (n: number) => void;
  minFont: number;
  maxFont: number;
  isBookmarked: (surah: number, ayah: number) => boolean;
  toggleBookmark: (surah: number, ayah: number) => void;
  reciter: string;
  setReciter: (id: string) => void;
  isRTL: boolean;
  s: QuranStrings;
}

export function SurahReader(props: SurahReaderProps) {
  const {
    surah, isLoading, isError, onRetry, onBack,
    fontSize, setFontSize, minFont, maxFont,
    isBookmarked, toggleBookmark, reciter, setReciter, isRTL, s,
  } = props;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;

  // Reset audio when surah changes
  useEffect(() => {
    setPlayingIndex(null);
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, [surah?.number]);

  // Play current ayah; re-runs when the reciter changes so switching mid-surah
  // swaps the audio source but keeps the same ayah (reading position preserved).
  useEffect(() => {
    const el = audioRef.current;
    if (!el || playingIndex == null || !surah) return;
    el.src = ayahAudioUrl(reciter, surah.ayahs[playingIndex].number);
    el.play().catch(() => setPlayingIndex(null));
  }, [playingIndex, surah, reciter]);

  const handleEnded = () => {
    if (!surah || playingIndex == null) return;
    const next = playingIndex + 1;
    if (next < surah.ayahs.length) {
      setPlayingIndex(next);
    } else {
      setPlayingIndex(null);
    }
  };

  const togglePlayAll = () => {
    if (playingIndex != null) {
      audioRef.current?.pause();
      setPlayingIndex(null);
    } else {
      setPlayingIndex(0);
    }
  };

  const togglePlayAyah = (index: number) => {
    if (playingIndex === index) {
      audioRef.current?.pause();
      setPlayingIndex(null);
    } else {
      setPlayingIndex(index);
    }
  };

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-destructive font-semibold mb-4">{s.errorTitle}</p>
        <div className="flex items-center justify-center gap-3">
          <Button onClick={onRetry} variant="outline" className="border-gold/50">{s.retry}</Button>
          <Button onClick={onBack} variant="ghost"><BackIcon className="h-4 w-4 me-1" />{s.back}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <audio ref={audioRef} onEnded={handleEnded} className="hidden" />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between sticky top-0 z-10 bg-background/90 backdrop-blur py-2 -mx-1 px-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-foreground">
          <BackIcon className="h-4 w-4 me-1" />
          {s.surahListTab}
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card px-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFontSize(fontSize - 2)} disabled={fontSize <= minFont} aria-label={`${s.fontSize} -`}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-xs w-6 text-center text-muted-foreground">{fontSize}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setFontSize(fontSize + 2)} disabled={fontSize >= maxFont} aria-label={`${s.fontSize} +`}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button size="sm" onClick={togglePlayAll} disabled={isLoading || !surah} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {playingIndex != null ? <Pause className="h-4 w-4 me-1" /> : <Play className="h-4 w-4 me-1" />}
            {playingIndex != null ? s.pause : s.playSurah}
          </Button>
        </div>
      </div>

      {isLoading || !surah ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* Surah header */}
          <div className="rounded-2xl border border-gold/40 bg-card overflow-hidden text-center p-5 shadow-sm">
            <p className="quran-arabic text-3xl text-primary mb-1" style={{ lineHeight: 1.6 }}>{surah.name}</p>
            <p className="font-semibold text-foreground">{surah.englishName} · {surah.englishNameTranslation}</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-1">
              <MapPin className="h-3 w-3" />
              <span>{surah.revelationType === 'Meccan' ? s.meccan : s.medinan}</span>
              <span aria-hidden>•</span>
              <span>{surah.numberOfAyahs} {s.ayahs}</span>
              <span aria-hidden>•</span>
              <span>{s.reciter}: {RECITER_NAME}</span>
            </div>
            {surah.number !== 1 && surah.number !== 9 && (
              <p className="quran-arabic text-2xl text-foreground mt-4" style={{ lineHeight: 1.8 }}>{BISMILLAH}</p>
            )}
          </div>

          {/* Ayahs */}
          <div className="space-y-2">
            {surah.ayahs.map((ayah, index) => {
              let text = ayah.text;
              if (ayah.numberInSurah === 1 && surah.number !== 1 && surah.number !== 9) {
                // strip leading bismillah (with possible BOM) from first ayah
                text = text.replace(/^\uFEFF?بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ\s*/, '');
              }
              const active = playingIndex === index;
              const marked = isBookmarked(surah.number, ayah.numberInSurah);
              return (
                <div
                  key={ayah.number}
                  className={`rounded-xl border p-4 transition-colors ${active ? 'border-gold bg-gold/10' : 'border-border bg-card'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {surah.number}:{ayah.numberInSurah}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => togglePlayAyah(index)} aria-label={active ? s.pause : s.playSurah}>
                        {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleBookmark(surah.number, ayah.numberInSurah)} aria-label={marked ? s.bookmarked : s.bookmark}>
                        {marked ? <BookmarkCheck className="h-4 w-4 text-gold" /> : <Bookmark className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                  <p className="quran-arabic text-foreground" style={{ fontSize: `${fontSize}px`, lineHeight: 2.1 }}>
                    {text}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground pt-2">{s.translationNote}</p>
        </>
      )}
    </div>
  );
}
